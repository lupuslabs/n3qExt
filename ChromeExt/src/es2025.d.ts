// ES2025 APIs used in this codebase.
// Document with first fully implementing versions from https://caniuse.com/ .

interface Uint8Array {
    toBase64(): string; // Chrome 140, Edge 140, Firefox 133, Firefox (Android) 146, Safari 18.2
}

interface Uint8ArrayConstructor {
    fromBase64(s: string): Uint8Array; // Chrome 140, Edge 140, Firefox 133, Firefox (Android) 146, Safari 18.2
}
