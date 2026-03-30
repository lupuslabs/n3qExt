import * as crypto from 'crypto';
import { Hash } from 'node:crypto'

export namespace CryptoUtils {

    export function hashNumber(s: string): number {
        let hash = 0;
        if (s.length === 0) { return 0; }

        s += 'abcd';

        for (let i = 0; i < s.length; i++) {
            const char = s.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        return Math.abs(hash);
    }

    export function hashStringSha1(s: string): string {
        const hasher = CryptoUtils.getSha1Hasher();
        hasher.update(new TextEncoder().encode(s));
        const hash = hasher.digest('hex');
        return hash;
    }

    export function hashStringByAlgo(algorithm: string, data: string): string {
        const hasher = crypto.createHash(algorithm.toLowerCase());
        hasher.update(data);
        const hash = hasher.digest('hex');
        return hash;
    }

    export function getSha1Hasher(): Hash {
        return crypto.createHash('sha1');
    }

    export function getSha256Hasher(): Hash {
        return crypto.createHash('sha256');
    }

    export function signStringHmacSha256(privateKey: Uint8Array, data: string): string {
        const hmacMaker = crypto.createHmac('sha256', privateKey);
        hmacMaker.update(new TextEncoder().encode(data))
        const hmac = hmacMaker.digest('hex')
        return hmac
    }
}
