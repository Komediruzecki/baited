"""No provider calls: provisioning is exercised against API and vault fixtures."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
script = Path(__file__).resolve().parents[1] / 'provision-hosted-tunnel.py'
spec = importlib.util.spec_from_file_location('provision_fixture', script)
provision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provision)


class ProvisionTest(unittest.TestCase):
    def exercise(self, stored_token, existing_item=True, child_failure=False):
        calls = []
        vault_calls = []
        output = io.StringIO()
        expected = 'fixture-current-token'
        real_run = subprocess.run

        def api(method, path, payload=None):
            calls.append((method, path))
            if path.endswith('?is_deleted=false'):
                return [{'name': provision.NAME, 'id': 'fixture-new-id', 'config_src': 'cloudflare'}]
            if path.endswith('/token'):
                return expected
            if method == 'PUT':
                return {}
            if path == '/zones?name=maff.app':
                return [{'id': 'fixture-zone'}]
            if '/dns_records?' in path:
                return [{'type': 'CNAME', 'content': 'fixture-new-id.cfargotunnel.com', 'proxied': True}]
            raise AssertionError(f'Unexpected request: {method} {path}')

        def vault(args, **kwargs):
            vault_calls.append(args)
            self.assertNotIn(expected, ' '.join(args))
            if args[1:3] == ['item', 'list']:
                items = [{'title': provision.VAULT_ITEM, 'state': 'Active'}] if existing_item else []
                return subprocess.CompletedProcess(args, 0, json.dumps({'items': items}), '')
            if args[1:3] == ['item', 'create']:
                self.assertEqual(json.loads(kwargs['input'])['sections'][0]['fields'][0]['value'], expected)
                return subprocess.CompletedProcess(args, 0, 'suppressed vault response', '')
            if args[1] == 'run':
                self.assertNotIn('CLOUDFLARE_API_TOKEN', kwargs['env'])
                self.assertNotIn('CLOUDFLARE_ACCOUNT_ID', kwargs['env'])
                if child_failure:
                    return subprocess.CompletedProcess(args, 1, expected, stored_token)
                env = {**kwargs['env'], 'TUNNEL_TOKEN': stored_token}
                # Exercise the real constant-time comparison child, replacing
                # only Proton's credential injection with a test fixture.
                return real_run(args[args.index('--') + 1:], input=kwargs['input'],
                                capture_output=True, text=True, timeout=5, env=env)
            raise AssertionError('Unexpected vault command')

        failure = None
        with patch.dict(os.environ, {'CLOUDFLARE_ACCOUNT_ID': 'fixture-account', 'CLOUDFLARE_API_TOKEN': 'fixture-api-token'}), \
             patch.object(sys, 'argv', ['provision', '--dns']), \
             patch.object(provision, 'api', api), \
             patch.object(provision.subprocess, 'run', vault), \
             contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            try:
                provision.main()
            except SystemExit as error:
                failure = str(error)
        self.assertNotIn(expected, output.getvalue())
        self.assertNotIn(stored_token, output.getvalue())
        return calls, vault_calls, failure

    def test_matching_existing_item_is_reused(self):
        calls, vault, failure = self.exercise('fixture-current-token')
        self.assertIsNone(failure)
        self.assertTrue(any(method == 'PUT' for method, _ in calls))
        self.assertFalse(any(args[1:3] == ['item', 'create'] for args in vault))
        self.assertFalse(any(method == 'POST' for method, _ in calls))

    def test_stale_item_stops_before_configuration_or_dns(self):
        calls, _, failure = self.exercise('fixture-stale-token')
        self.assertIn('could not be verified', failure)
        self.assertFalse(any(method != 'GET' for method, _ in calls))
        self.assertFalse(any(path.startswith('/zones') for _, path in calls))

    def test_proton_failure_suppresses_diagnostics_and_stops(self):
        calls, _, failure = self.exercise('fixture-stale-token', child_failure=True)
        self.assertIn('could not be verified', failure)
        self.assertNotIn('fixture-current-token', failure)
        self.assertFalse(any(method != 'GET' for method, _ in calls))

    def test_new_item_is_created_over_stdin(self):
        calls, vault, failure = self.exercise('fixture-unused-token', existing_item=False)
        self.assertIsNone(failure)
        self.assertEqual(sum(args[1:3] == ['item', 'create'] for args in vault), 1)
        self.assertTrue(any(method == 'PUT' for method, _ in calls))


if __name__ == '__main__':
    unittest.main()
