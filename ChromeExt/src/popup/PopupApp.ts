import * as imgPopupIcon from '../assets/PopupIcon.png';

import log = require('loglevel');
import { is } from '../lib/is';
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { Memory } from '../lib/Memory';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { Translator } from '../lib/Translator';
import { AvatarGallery, GalleryAvatar } from '../lib/AvatarGallery';
import { RandomNames } from '../lib/RandomNames';
import { DomUtils } from '../lib/DomUtils';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { AppWithDom } from '../lib/App'
import { BackgroundMessageUrlFetcher } from '../lib/UrlFetcher'

export class PopupApp extends AppWithDom
{
    private display: HTMLElement;
    private babelfish: Translator;
    private defaultDevConfig = `{}`;
    private onClose: () => void;

    private currentAvatar: GalleryAvatar;
    private nicknameElem: HTMLInputElement;

    public constructor(protected appendToMe: HTMLElement)
    {
        super();
        let navLang = as.String(Config.get('i18n.overrideBrowserLanguage', ''));
        if (navLang === '') {
            navLang = navigator.language;
        }
        const defaultLandg = Config.get('i18n.defaultLanguage', 'en-US');
        const langMapper = lang => Config.get('i18n.languageMapping', {})[lang];
        const language: string = Translator.mapLanguage(navLang, langMapper, defaultLandg);
        const translationTable = Config.get('i18n.translations', {})[language];
        const serviceUrl = Config.get('i18n.serviceUrl', '')
        this.babelfish = new Translator(translationTable, language, serviceUrl, new BackgroundMessageUrlFetcher());
    }

    public onError(error: unknown): void
    {
        log.warn(error);
    }

    public dev_start(): void
    {
        let start = DomUtils.elemOfHtml('<button style="display: inline;">Start</button>');
        PointerEventDispatcher.makeOpaqueDispatcher(this, start).addUnmodifiedLeftClickListener(ev => {
            this.start(null).catch(error => this.onError(error))
        });
        let stop = DomUtils.elemOfHtml('<button style="display: inline;">Stop</button>');
        PointerEventDispatcher.makeOpaqueDispatcher(this, stop).addUnmodifiedLeftClickListener(ev => this.stop());
        this.appendToMe.append(start);
        this.appendToMe.append(stop);
        this.appendToMe.style.minWidth = '25em';
    }

    public async start(onClose: () => void): Promise<void>
    {
        this.onClose = onClose;

        try {
            const config = await BackgroundMessage.getConfigTree(Config.onlineConfigName);
            Config.setOnlineTree(config);
        } catch (error) {
            log.warn(error);
        }

        this.display = DomUtils.elemOfHtml('<div id="n3q-id-popup" class="n3q-base" data-translate="children"/>');
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this, this.display);

        const nickname = as.String(await Memory.getLocal(Utils.localStorageKey_Nickname(), 'Your name'));
        const avatars = new AvatarGallery();
        this.currentAvatar = await avatars.getAvatarFromLocalMemory();

        this.display.append(this.makeHeaderGroupHtml());
        this.display.append(this.makeNicknameGroupHtml(nickname));
        this.display.append(this.makeAvatarGroupHtml());
        this.display.append(this.makeSaveGroupHtml());

        this.babelfish.translateElem(this.display);
        this.appendToMe.append(this.display);
    }

    private makeHeaderGroupHtml(): HTMLElement
    {
        const group = DomUtils.elemOfHtml('<div class="n3q-base n3q-popup-header" data-translate="children"/>');

        const icon = <HTMLImageElement> DomUtils.elemOfHtml('<img class="n3q-base n3q-popup-icon"/>');
        icon.src = imgPopupIcon;
        group.append(icon);

        const title = DomUtils.elemOfHtml('<div class="n3q-base n3q-popup-title" data-translate="text:Popup.title">Your Weblin</div>');
        group.append(title);

        const description = DomUtils.elemOfHtml('<div class="n3q-base n3q-popup-description" data-translate="text:Popup.description">Change name and avatar, then reload the page.</div>');
        group.append(description);

        const iconDispatcher = PointerEventDispatcher.makeDispatcher(this, icon);
        iconDispatcher.addCtrlLeftClickListener(ev => this.devConfig(group));
        iconDispatcher.addUnmodifiedLeftDoubleclickListener(ev => this.devConfig(group));

        return group;
    }

    private makeNicknameGroupHtml(nickname: string): HTMLElement
    {
        const nicknameGroup = DomUtils.elemOfHtml('<div class="n3q-base n3q-popup-group n3q-popup-group-nickname" data-translate="children"/>');

        const label = DomUtils.elemOfHtml('<div class="n3q-base n3q-popup-label" data-translate="text:Popup">Name</div>');
        nicknameGroup.append(label);

        this.nicknameElem = <HTMLInputElement> DomUtils.elemOfHtml(`<input type="text" id="n3q-id-popup-nickname" class="n3q-base" value="${nickname}"/>`);
        nicknameGroup.append(this.nicknameElem);

        const button = DomUtils.elemOfHtml('<button class="n3q-base n3q-popup-random" data-translate="text:Popup">Random</button>');
        PointerEventDispatcher.makeOpaqueDispatcher(this, button).addUnmodifiedLeftClickListener(ev => {
            this.nicknameElem.value = RandomNames.getRandomNickname();
        });
        nicknameGroup.append(button);

        return nicknameGroup;
    }

    private makeAvatarGroupHtml(): HTMLElement
    {
        const group = DomUtils.elemOfHtml('<div class="n3q-base n3q-popup-group n3q-popup-group-avatar" data-translate="children"/>');

        const avatarGallery = DomUtils.elemOfHtml('<div class="n3q-base n3q-popup-group-avatar-gallery" data-translate="children"/>');
        const label = DomUtils.elemOfHtml('<div class="n3q-base n3q-popup-label" data-translate="text:Popup">Avatar</div>');
        const left = DomUtils.elemOfHtml('<button class="n3q-base n3q-popup-avatar-arrow n3q-popup-avatar-left">&lt;</button>');
        const avatarImgWrapElem = DomUtils.elemOfHtml('<div class="n3q-base n3q-popup-avatar-current"/>');
        const avatarImgElem = <HTMLImageElement> DomUtils.elemOfHtml('<img class="n3q-base"/>');
        avatarImgWrapElem.append(avatarImgElem);
        const right = DomUtils.elemOfHtml('<button class="n3q-base n3q-popup-avatar-arrow n3q-popup-avatar-right">&gt;</button>');
        avatarGallery.append(label);
        avatarGallery.append(left);
        avatarGallery.append(avatarImgWrapElem);
        avatarGallery.append(right);
        group.append(avatarGallery);

        const updateCurrentAvatar = currentAvatar => {
            this.currentAvatar = currentAvatar;
            const previewUrlRaw = currentAvatar.getPreviewUrl();
            BackgroundMessage.fetchUrlAsDataUrl(previewUrlRaw, '')
                .catch(error => previewUrlRaw)
                .then(previewUrlData => {
                    if (currentAvatar === this.currentAvatar) {
                        avatarImgElem.src = previewUrlData;
                    }
                });
        };
        updateCurrentAvatar(this.currentAvatar);
        PointerEventDispatcher.makeOpaqueDispatcher(this, left).addUnmodifiedLeftClickListener(ev => {
            updateCurrentAvatar(this.currentAvatar.getPreviousAvatar());
        });
        PointerEventDispatcher.makeOpaqueDispatcher(this, right).addUnmodifiedLeftClickListener(ev => {
            updateCurrentAvatar(this.currentAvatar.getNextAvatar());
        });

        const avatarGenUrl = Config.get('settings.avatarGeneratorLink', 'https://www.weblin.io/Avatars');
        const avatarGenBlock = DomUtils.elemOfHtml(''
            + '<div class="n3q-base n3q-popup-group-avatar-generator" data-translate="children">'
            +     '<div data-translate="text:Popup">Create your own avatar</div>'
            +     `<a href="${avatarGenUrl}" target="_blank" data-translate="text:Popup">`
            +         'Avatar Generator'
            +         '<span class="n3q-base n3q-popup-avatar-generator-link-icon"/>'
            +     '</a>'
            + '</div>'
        );
        group.append(avatarGenBlock);
        PointerEventDispatcher.protectElementsWithDefaultActions(this, avatarGenBlock);

        return group;
    }

    private makeSaveGroupHtml(): HTMLElement
    {
        const group = DomUtils.elemOfHtml('<div class="n3q-base n3q-popup-group n3q-popup-group-save" data-translate="children"/>');

        const saving = DomUtils.elemOfHtml('<div class="n3q-base n3q-popup-save-saving" data-translate="text:Popup">Saving</div>');

        const save = DomUtils.elemOfHtml('<button class="n3q-base n3q-popup-save" data-translate="text:Popup">Save</button>');
        PointerEventDispatcher.makeOpaqueDispatcher(this, save).addUnmodifiedLeftClickListener(ev => {
            const transition = {property: 'opacity', duration: '0.2s'};
            const nickname2Save = this.nicknameElem.value;
            DomUtils.startElemTransition(saving, null, transition, '1', () => {
                Memory.setLocal(Utils.localStorageKey_Nickname(), nickname2Save)
                .then(() => this.currentAvatar.setAvatarInLocalMemory())
                .then(() => BackgroundMessage.userSettingsChanged())
                .then(() => {
                    const transition = {property: 'opacity', duration: '1s'};
                    DomUtils.startElemTransition(saving, null, transition, '0', () => this.close());
                }).catch(error => log.info(error));
            });
        });
        group.append(save);
        group.append(saving);

        const close = DomUtils.elemOfHtml('<button class="n3q-base n3q-popup-close" data-translate="text:Common">Close</button>');
        PointerEventDispatcher.makeOpaqueDispatcher(this, close).addUnmodifiedLeftClickListener(ev => this.close());
        group.append(close);

        return group;
    }

    public close(): void
    {
        this.onClose?.();
    }

    private devConfig(group: HTMLElement): void
    {
        const customCfgStorageKey = Utils.localStorageKey_CustomConfig();
        let dev = this.display.querySelector('#n3q-popup-dev');
        if (is.nil(dev)) {
            dev = DomUtils.elemOfHtml('<div id="n3q-popup-dev" class="n3q-base n3q-popup-hidden"/>');
            const text = <HTMLTextAreaElement> DomUtils.elemOfHtml('<textarea class="n3q-base n3q-popup-dev-in" style="width: 100%; height: 100px; margin-top: 1em;"/>');
            PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this, text);
            Memory.getLocal(customCfgStorageKey, this.defaultDevConfig).then(data => {
                text.value = data;
                dev.append(text);
                const apply = DomUtils.elemOfHtml('<button class="n3q-base n3q-popup-dev-apply" style="margin-top: 0.5em;">Save</button>');
                PointerEventDispatcher.makeOpaqueDispatcher(this, apply).addUnmodifiedLeftClickListener(ev => {
                    Memory.setLocal(customCfgStorageKey, text.value)
                    .catch(error => log.info(error));
                });
                dev.append(apply);
                group.append(dev);
            }).catch(error => log.info(error));
        }
        if (dev.classList.contains('n3q-popup-hidden')) {
            dev.classList.remove('n3q-popup-hidden');
        } else {
            dev.classList.add('n3q-popup-hidden');
        }
    }

    public stop(): void
    {
        this.display?.remove();
        this.display = null;
    }

    public getShadowDomRoot(): DocumentOrShadowRoot {
        return document;
    }

}
