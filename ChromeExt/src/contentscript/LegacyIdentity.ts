const $ = require('jquery');
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { PropertyStorage } from './PropertyStorage';
import { as } from '../lib/as';
import { Config } from '../lib/Config';

export class LegacyIdentity
{
    private url: string = '';
    private digest: string = '';

    constructor(private storage: PropertyStorage, private entity: string)
    {
    }

    async changed(url: string, digest: string): Promise<void>
    {
        if (url != '' && url != this.url || digest != this.digest) {
            this.url = url;
            this.digest = digest;

            let response = await BackgroundMessage.fetchUrl(url, digest);
            if (response.ok) {
                this.evaluate(response.data);
            }
        }
    }

    evaluate(data: string): void
    {
        try {
            // let data: string = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE identity-xml [\n<!ATTLIST item id ID #IMPLIED>\n]>\n<identity xmlns="http://schema.bluehands.de/digest-container" digest="49129562173829b47fbdf856b222ef3b7dabb25d">\n<item id="avatar" contenttype="avatar" digest="86adeaada15ea4f2d7d11cd06dfe356d37626abl" src="https://files.zweitgeist.com/3b/79/18/0016b364f66c3e2ea5a407ea7d61b6995e.gif" order="1"/>\n<item id="avatar2" contenttype="avatar2" digest="1" src="https://storage.zweitgeist.com/index.php/295/avatar2" mimetype="avatar/gif" order="1"/>\n<item id="profilepage" contenttype="profilepage" digest="bea72819090fcc3eda2153341a717732bf43e25f" src="https://www.weblin.com/profile.php?cid=295" order="1"/>\n<item id="properties" contenttype="properties" digest="70df0a6021cc20ff2192bada3001f10c06bd2ghh" encoding="plain" mimetype="text/plain" order="1"><![CDATA[KickVote=true\nNickname=Planta Velociä\nGender=male\nProfilePage=https://www.weblin.com/profile.php?cid=295\nNicknameLink=http://www.virtual-presence.org\nPoints=10430\nPoints.Check=27395d80656f560cf99b13a4e9e1157b87e8d60b\nCommunityID=zweitgeist\nCommunityFaction=_default\nCommunityTag=https://files.zweitgeist.com/cf/c5/57/d9bb67aa26f67b648de24fe1f8fd4525b7.png\nCommunityName=Planta\'s Weblog\nCommunityPage=http://blog.wolfspelz.de/\n]]></item>\n<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod><Reference URI="#avatar"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>XaGomLa3xpEvyuYun0wV/MCe5kI=</DigestValue></Reference><Reference URI="#avatar2"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>b7RDuY+gEy2misGo3vNysw4U0YQ=</DigestValue></Reference><Reference URI="#profilepage"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>xcsGCazIVQZ+geSMsEPAzKSaOZY=</DigestValue></Reference><Reference URI="#properties"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>x+Een8d1ObWusPBzcuLy1xanLSU=</DigestValue></Reference></SignedInfo><SignatureValue>mPQFPRSfnio1bj+veFNPXgM4iofbPLmCswyzyErf1jFVkWjtxkttZ7J3r638zd04mfeKjReuCF96dwsLQyDRYsNUqODl0H3sBFeaw0tmHA3fC3+eNezeGvZEiaPZc/wMGQfsXgdobsSjv5gRpYgwMcuF/CbuwDDW+IRAr7Zkt8s=</SignatureValue></Signature></identity>';
            // let xml = $.parseXML(data);
            // $(xml).find('item').each((index, item) =>
            // {
            //   log.log($(item).attr('id'), $(item).text());
            // });
            let xml = $.parseXML(data);
            $(xml).find('item').each((index, item) =>
            {
                this.setItem($(item).attr('id'),
                    {
                        'digest': $(item).attr('digest'),
                        'contenttype': $(item).attr('contenttype'),
                        'src': $(item).attr('src'),
                        'mimetype': $(item).attr('mimetype'),
                        'order': $(item).attr('order'),
                        'text': $(item).text()
                    });
            });
        } catch (error) {
        }
    }

    setItem(id: string, props: any)
    {
        switch (id) {
            case 'avatar':
                this.storage.setProperty(this.entity, 'ImageUrl', as.String(props.src, ''));
                break;
            case 'avatar2':
                {
                    let animationsUrl = as.String(props.src, '');
                    if (animationsUrl != '') {
                        let proxiedAnimationsUrl = as.String(Config.get('avatars.animationsProxyUrlTemplate', 'https://webex.vulcan.weblin.com/Avatar/InlineData?url={url}')).replace('{url}', encodeURIComponent(animationsUrl));
                        this.storage.setProperty(this.entity, 'AnimationsUrl', proxiedAnimationsUrl);
                    }
                }
                break;
            case 'profilepage':
                this.storage.setProperty(this.entity, 'ProfileUrl', as.String(props.src, ''));
                break;
            case 'properties':
                {
                    if (as.String(props.mimetype, '') == 'text/plain' || as.String(props.encoding, '') == 'plain') {
                        let text = as.String(props.text, '');
                        let removedCr = text.replace(/(?:\r\n|\r|\n)/g, '\n');
                        let lines = removedCr.split('\n');
                        lines.forEach(line =>
                        {
                            let parts = line.trim().split('=', 2);
                            if (parts.length == 2) {
                                this.storage.setProperty(this.entity, parts[0], parts[1]);
                            }
                        });
                    }
                }
                break;
            default:
                this.storage.setProperty(this.entity, id, as.String(props.text, ''));
                break;
        }
    }
}
