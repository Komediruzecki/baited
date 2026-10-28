"""Move the existing PC tunnel route without creating compute or reading secrets.

Run via pass-cli and cloudflare.env.tmpl. Default is a read-only preflight;
--apply writes only the exact dev DNS record and existing tunnel ingress.
"""
import argparse
from copy import deepcopy
import importlib.util
import os
from pathlib import Path

spec = importlib.util.spec_from_file_location('baited_provision', Path(__file__).with_name('provision-hosted-tunnel.py'))
provision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provision)
api, NAME = provision.api, provision.NAME

OLD = 'play-baited.maff.app'
DEV = 'dev-play-baited.maff.app'


class RouteConfigError(ValueError):
    """Only fixed, locally authored validation messages may be displayed."""


def moved_config(config):
    updated = deepcopy(config)
    ingress = updated.get('ingress', [])
    old = [r for r in ingress if r.get('hostname') == OLD]
    dev = [r for r in ingress if r.get('hostname') == DEV]
    if len(old) > 1 or len(dev) > 1 or not (old or dev):
        raise RouteConfigError('Expected a unique current or development route.')
    for route, host, port in [(r, OLD, 3300) for r in old] + [(r, DEV, 3301) for r in dev]:
        if host == OLD and route.get('service') == 'http_status:404' and not route.get('path') and dev:
            continue
        if route.get('service') != f'http://127.0.0.1:{port}' or route.get('path'):
            raise RouteConfigError('Existing Baited route differs from the known PC configuration.')
        if route.get('originRequest', {}).get('httpHostHeader', host) != host:
            raise RouteConfigError('Existing Baited route has an unexpected host override.')
    if not ingress or 'hostname' in ingress[-1] or ingress[-1].get('service') != 'http_status:404':
        raise RouteConfigError('Expected the existing final 404 route.')
    source = dev[0] if dev else old[0]
    source['hostname'] = DEV
    source['service'] = 'http://127.0.0.1:3301'
    source.setdefault('originRequest', {})['httpHostHeader'] = DEV
    # Exact owned routes precede preserved wildcard routes. Other routes keep
    # their relative ordering, including the final catch-all.
    updated['ingress'] = [source, {'hostname': OLD, 'service': 'http_status:404'}] + [
        route for route in ingress if route not in old and route not in dev]
    return updated


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    prefix = '/accounts/' + os.environ['CLOUDFLARE_ACCOUNT_ID'] + '/cfd_tunnel'
    tunnels = [t for t in api('GET', prefix + '?is_deleted=false') if t['name'] == NAME]
    if len(tunnels) != 1 or tunnels[0].get('config_src') != 'cloudflare':
        raise SystemExit('Expected the existing remotely managed Baited tunnel; no changes.')
    config_path = prefix + '/' + tunnels[0]['id'] + '/configurations'
    original = api('GET', config_path)['config']
    desired = moved_config(original)
    zones = api('GET', '/zones?name=maff.app')
    if len(zones) != 1:
        raise SystemExit('Expected exactly one maff.app zone; no changes.')
    dns_path = '/zones/' + zones[0]['id'] + '/dns_records'
    records = api('GET', dns_path + '?name=' + DEV)
    target = tunnels[0]['id'] + '.cfargotunnel.com'
    if records and (len(records) != 1 or records[0]['type'] != 'CNAME' or
                    records[0]['content'] != target or not records[0]['proxied']):
        raise SystemExit('Dev hostname already points elsewhere; no changes.')
    print('Verified existing named tunnel and dev hostname availability.')
    print('Planned: dev host -> loopback 3301; old play host -> explicit 404. Other routes preserved.')
    if not args.apply:
        print('Read-only preflight complete. No resource or DNS change.')
        return
    # Re-read before mutation to avoid overwriting another administrator's changes.
    if api('GET', config_path)['config'] != original:
        raise SystemExit('Tunnel configuration changed during preflight; no changes.')
    if not records:
        api('POST', dns_path, {'type': 'CNAME', 'name': DEV, 'content': target, 'proxied': True, 'ttl': 1})
        print('Dev DNS created on the existing tunnel.')
    if desired != original:
        api('PUT', config_path, {'config': desired})
    if api('GET', config_path)['config'] != desired:
        raise SystemExit('Tunnel read-back differs; inspect routing before using the host.')
    print('Migration routing verified. No compute or paid service activated.')


def entrypoint():
    try:
        main()
    except RouteConfigError as error:
        raise SystemExit(str(error)) from None
    except ValueError:
        raise SystemExit('Invalid migration input or API response; details suppressed.') from None


if __name__ == '__main__':
    entrypoint()
