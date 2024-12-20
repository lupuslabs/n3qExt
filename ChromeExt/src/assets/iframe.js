// This needs to be in an extra file because Chrome doesn't think it's safe when it's inlined into iframe.html
(() => {
    // Load the passed URL into the iframe to get around restrictive CSP headers:
    const iframeUrl = new URL(document.URL).searchParams.get('url')
    const iframeElem = document.createElement('iframe')
    iframeElem.src = iframeUrl
    document.body.append(iframeElem)
})()
