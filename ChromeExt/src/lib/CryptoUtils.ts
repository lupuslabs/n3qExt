import { sha1 } from '@noble/hashes/legacy.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'

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
        return sha1(new TextEncoder().encode(s)).toHex()
    }

    export function hashStringByAlgo(algorithm: string, data: string): string {
        const bytes = new TextEncoder().encode(data)
        switch (algorithm.toLowerCase()) {
            case 'sha1': return sha1(bytes).toHex()
            case 'sha256': return sha256(bytes).toHex()
            case 'sha512': return sha512(bytes).toHex()
            default: throw new Error(`Unsupported hash algorithm: ${algorithm}`)
        }
    }

    export function getSha256Hasher() {
        return sha256.create()
    }

    export function signStringHmacSha256(privateKey: Uint8Array, data: string): string {
        return hmac(sha256, privateKey, new TextEncoder().encode(data)).toHex()
    }
}
