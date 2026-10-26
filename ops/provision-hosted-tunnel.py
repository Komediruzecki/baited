"""Provision the single Baited test tunnel. Run through cloudflare.env.tmpl.

Secrets stay in process memory and are sent to Proton over stdin. This never
prints API responses, tokens or subprocess diagnostics that may contain them.
Use --dns after the token has Zone DNS Edit permission on maff.app.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

NAME = 'baited-hosted-test'
HOST = 'play-baited.maff.app'
VAULT_ITEM = 'baited-hosted-tunnel'
TUNNEL_ENV = Path(__file__).resolve().parents[1] / 'packages/app/docs/baited.hosted-tunnel.env.tmpl'


def api(method, path, payload=None):
    request = urllib.request.Request(
        'https://api.cloudflare.com/client/v4' + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN'],
                 'Content-Type': 'application/json'}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f'Cloudflare {method} request failed with HTTP {error.code}; response suppressed.') from None
    if not result.get('success'):
        raise SystemExit('Cloudflare request failed; response suppressed.')
    return result['result']


def verify_stored_token(token):
    """Compare Proton and Cloudflare values in child memory, never in output."""
    try:
        result = subprocess.run(
            ['pass-cli', 'run', '--env-file', str(TUNNEL_ENV), '--', sys.executable, '-c',
             'import hmac, os, sys; expected = sys.stdin.read(); '
             'stored = os.environ.get("TUNNEL_TOKEN", ""); '
             'sys.exit(0 if stored and hmac.compare_digest(stored, expected) else 42)'],
            input=token, capture_output=True, text=True, timeout=60,
            env={key: value for key, value in os.environ.items()
                 if key not in {'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'}})
    except (OSError, subprocess.TimeoutExpired):
        raise SystemExit('Proton token verification could not finish; configuration and DNS left unchanged.') from None
    if result.returncode:
        raise SystemExit('Existing Proton tunnel token could not be verified against this Cloudflare tunnel. '
                         'Configuration and DNS left unchanged. Recover the correct Proton token before retrying; '
                         'values and subprocess diagnostics suppressed.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dns', action='store_true')
    args = parser.parse_args()
    account = os.environ['CLOUDFLARE_ACCOUNT_ID']
    prefix = '/accounts/' + account + '/cfd_tunnel'
    matches = [t for t in api('GET', prefix + '?is_deleted=false') if t['name'] == NAME]
    if len(matches) > 1:
        raise SystemExit('More than one matching tunnel; inspect manually.')
    tunnel = matches[0] if matches else api('POST', prefix, {'name': NAME, 'config_src': 'cloudflare'})
    if tunnel.get('config_src') != 'cloudflare':
        raise SystemExit('Existing tunnel is not remotely managed; left unchanged.')
    tunnel_id = tunnel['id']
    listing = subprocess.run(['pass-cli', 'item', 'list', 'dev', '--output', 'json'], capture_output=True, text=True)
    if listing.returncode:
        raise SystemExit('Could not list Proton item metadata.')
    items = [i for i in json.loads(listing.stdout)['items'] if i['title'] == VAULT_ITEM and i['state'] == 'Active']
    if len(items) > 1:
        raise SystemExit('Duplicate Proton tunnel items; left unchanged.')
    token = api('GET', prefix + '/' + tunnel_id + '/token')
    if not isinstance(token, str) or not token:
        raise SystemExit('Cloudflare did not return a tunnel token; response suppressed.')
    if not items:
        data = {'title': VAULT_ITEM, 'note': 'Named tunnel ' + NAME + ' (' + tunnel_id + ') for ' + HOST,
                'sections': [{'section_name': 'Cloudflare Tunnel', 'fields': [
                    {'field_name': 'token', 'field_type': 'hidden', 'value': token}]}]}
        result = subprocess.run(['pass-cli', 'item', 'create', 'custom', '--vault-name', 'dev', '--from-template', '-'],
                                input=json.dumps(data), capture_output=True, text=True)
        if result.returncode:
            raise SystemExit('Tunnel exists but saving token in Proton failed; response suppressed. Retry to recover.')
        print('Tunnel token stored in Proton dev/' + VAULT_ITEM + '/token.')
    else:
        verify_stored_token(token)
    config = {'config': {'ingress': [
        {'hostname': HOST, 'service': 'http://127.0.0.1:3300',
         'originRequest': {'httpHostHeader': HOST}},
        {'service': 'http_status:404'}]}}
    api('PUT', prefix + '/' + tunnel_id + '/configurations', config)
    print('Named tunnel configured: ' + NAME + ' (' + tunnel_id + ').')
    if args.dns:
        zones = api('GET', '/zones?name=maff.app')
        if len(zones) != 1:
            raise SystemExit('Expected exactly one maff.app zone.')
        dns_path = '/zones/' + zones[0]['id'] + '/dns_records'
        records = api('GET', dns_path + '?name=' + HOST)
        target = tunnel_id + '.cfargotunnel.com'
        if records:
            if len(records) != 1 or records[0]['type'] != 'CNAME' or records[0]['content'] != target or not records[0]['proxied']:
                raise SystemExit('Existing hostname points elsewhere; left unchanged.')
        else:
            api('POST', dns_path, {'type': 'CNAME', 'name': HOST, 'content': target, 'proxied': True, 'ttl': 1})
        print('DNS verified: ' + HOST + ' routes to the named tunnel.')


if __name__ == '__main__':
    main()
