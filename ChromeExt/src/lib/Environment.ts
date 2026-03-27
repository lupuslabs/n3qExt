declare global
{
    const COMPILED_NODE_ENV: string
}

export class Environment
{
    static NODE_ENV_development = 'development';
    static NODE_ENV: string;

    static get_NODE_ENV(): string
    {
        return COMPILED_NODE_ENV; // injected by rspack.DefinePlugin in rspack.base.config.mjs.
    }

    static isDevelopment(): boolean
    {
        return (this.NODE_ENV ?? this.get_NODE_ENV()) === this.NODE_ENV_development;
    }

    static isEmbedded(): boolean
    {
        return !Environment.isExtension();
    }

    static isExtension(): boolean
    {
        return (typeof chrome !== 'undefined') && !!(chrome.runtime?.onMessage);
    }
}
