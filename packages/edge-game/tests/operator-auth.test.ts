import assert from 'node:assert/strict';
import test from 'node:test';
import { operatorAuthorized } from '../src/operator-auth.js';

test('operator authentication requires the dedicated key and exact host without browser credentials',()=>{
  const key='public-fixture-operator-key-00000000000000000000';
  const env={EDGE_OPERATOR_KEY:key,EDGE_PUBLIC_ORIGIN:'https://pilot.test',ROOMS:{} as DurableObjectNamespace};
  const request=(headers:HeadersInit={})=>new Request('https://pilot.test/api/operator/status',{headers:{authorization:`Bearer ${key}`,...headers}});
  assert.equal(operatorAuthorized(request(),env),true);
  assert.equal(operatorAuthorized(request({host:'another.test'}),env),false);
  assert.equal(operatorAuthorized(request({authorization:`Bearer ${key.slice(1)}`}),env),false);
  assert.equal(operatorAuthorized(request({origin:'https://pilot.test'}),env),false);
  assert.equal(operatorAuthorized(request({cookie:'session=test'}),env),false);
  assert.equal(operatorAuthorized(request(),{...env,EDGE_OPERATOR_KEY:undefined}),false);
});
