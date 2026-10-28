import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout
from io import StringIO

spec = importlib.util.spec_from_file_location('move_hosted', Path(__file__).parents[1] / 'move-hosted-test-to-dev.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.config = {'originRequest': {'connectTimeout': 30}, 'ingress': [
            {'hostname': 'unrelated.maff.app', 'service': 'http://127.0.0.1:9999'},
            {'hostname': module.OLD, 'service': 'http://127.0.0.1:3300',
             'originRequest': {'httpHostHeader': module.OLD, 'connectTimeout': 10}},
            {'service': 'http_status:404'}]}

    def test_preserves_unrelated_routes_and_settings_without_mutating_input(self):
        moved = module.moved_config(self.config)
        self.assertEqual(moved['ingress'][2], self.config['ingress'][0])
        self.assertEqual(moved['originRequest'], self.config['originRequest'])
        self.assertEqual(moved['ingress'][0]['hostname'], module.DEV)
        self.assertEqual(moved['ingress'][0]['service'], 'http://127.0.0.1:3301')
        self.assertEqual(moved['ingress'][0]['originRequest']['connectTimeout'], 10)
        self.assertEqual(self.config['ingress'][1]['hostname'], module.OLD)
        self.assertEqual(module.moved_config(moved), moved)

    def test_rejects_unexpected_existing_service_and_duplicate_routes(self):
        self.config['ingress'][1]['service'] = 'http://unrelated:3300'
        with self.assertRaises(ValueError):
            module.moved_config(self.config)
        self.setUp()
        self.config['ingress'].insert(1, dict(self.config['ingress'][1]))
        with self.assertRaises(ValueError):
            module.moved_config(self.config)

    def test_existing_dev_route_is_preserved_and_old_route_removed(self):
        dev = {'hostname': module.DEV, 'service': 'http://127.0.0.1:3301',
               'originRequest': {'httpHostHeader': module.DEV}}
        self.config['ingress'].insert(1, dev)
        self.assertEqual(module.moved_config(self.config)['ingress'],
                         [dev,
                          {'hostname': module.OLD, 'service': 'http_status:404'},
                          self.config['ingress'][0],
                          {'service': 'http_status:404'}])

    def test_old_host_is_explicitly_disabled_before_later_wildcard(self):
        wildcard = {'hostname': '*.maff.app', 'service': 'http://127.0.0.1:8888'}
        self.config['ingress'].insert(-1, wildcard)
        moved = module.moved_config(self.config)
        disabled = {'hostname': module.OLD, 'service': 'http_status:404'}
        self.assertLess(moved['ingress'].index(disabled), moved['ingress'].index(wildcard))
        self.assertEqual(module.moved_config(moved), moved)

    def test_default_preflight_has_no_writes(self):
        responses = [
            [{'id': 'fixture-tunnel', 'name': module.NAME, 'config_src': 'cloudflare'}],
            {'config': self.config}, [{'id': 'fixture-zone'}], []]
        with patch.object(module, 'api', side_effect=responses) as api, \
             patch.dict(module.os.environ, {'CLOUDFLARE_ACCOUNT_ID': 'fixture-account'}), \
             patch('sys.argv', ['move-hosted-test-to-dev.py']), redirect_stdout(StringIO()):
            module.main()
        self.assertEqual(len(api.call_args_list), 4)
        self.assertTrue(all(call.args[0] == 'GET' for call in api.call_args_list))

    def test_unexpected_value_errors_do_not_print_authorization_values(self):
        secret = 'synthetic-only-token'
        with patch.object(module, 'main', side_effect=ValueError('Invalid header Bearer ' + secret)):
            with self.assertRaises(SystemExit) as failure:
                module.entrypoint()
        self.assertNotIn(secret, str(failure.exception))
        self.assertIn('suppressed', str(failure.exception))


if __name__ == '__main__':
    unittest.main()
