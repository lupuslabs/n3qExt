import log = require('loglevel');

export class Browser
{
    static getCurrentPageUrl(): string
    {
        return document.location.toString();
    }
}
