import assert from 'assert';
import mongoose from 'mongoose';
import { createFileDeleteHandler } from '../../../lib/router/handlersFactory.js';

// Simple helper to mock express req/res
const makeReqRes = (params: any = {}) => {
    const req: any = { params };
    let statusCode: number | null = null;
    let body: any = null;
    const res: any = {
        status(code: number) {
            statusCode = code;
            return this;
        },
        json(payload: any) {
            body = payload;
            return { statusCode, body };
        }
    };
    return { req, res, getResult: () => ({ statusCode, body }) };
};

async function testInvalidId() {
    const { req, res, getResult } = makeReqRes({ fileId: 'not-a-valid-id' });
    const handler = createFileDeleteHandler({} as any);

    await handler(req, res, () => { });

    const result = getResult();
    assert.strictEqual(result.statusCode, 400, 'Expected 400 for invalid id');
    assert.ok(result.body && result.body.code === 'INVALID_FILE_ID', 'Expected INVALID_FILE_ID code');
}

async function testMissingId() {
    const { req, res, getResult } = makeReqRes({});
    const handler = createFileDeleteHandler({} as any);

    await handler(req, res, () => { });

    const result = getResult();
    assert.strictEqual(result.statusCode, 400, 'Expected 400 for missing id');
    assert.ok(result.body && result.body.code === 'INVALID_FILE_ID', 'Expected INVALID_FILE_ID code for missing id');
}

(async () => {
    try {
        await testInvalidId();
        console.log('testInvalidId passed');
        await testMissingId();
        console.log('testMissingId passed');
    } catch (err) {
        console.error('Tests failed', err);
        process.exit(1);
    }
})();
