import imgPopupIcon from '../assets/PopupIcon.png';

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
import { DomButtonId, domHtmlElemOfHtml, startDomElemTransition } from '../lib/domTools';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { AppWithDom } from '../lib/App'
import { DomModifierKeyId } from '../lib/PointerEventData'

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
        this.babelfish = new Translator(translationTable, language, Config.get('i18n.serviceUrl', ''));
    }

    public onError(error: unknown): void
    {
        log.warn(error);
    }

    public dev_start(): void
    {
        let start = domHtmlElemOfHtml('<button style="display: inline;">Start</button>');
        PointerEventDispatcher.makeOpaqueDispatcher(this, start).addUnmodifiedLeftclickListener(ev => {
            this.start(null).catch(error => this.onError(error))
        });
        let stop = domHtmlElemOfHtml('<button style="display: inline;">Stop</button>');
        PointerEventDispatcher.makeOpaqueDispatcher(this, stop).addUnmodifiedLeftclickListener(ev => this.stop());
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

        this.display = domHtmlElemOfHtml('<div id="n3q-id-popup" class="n3q-base" data-translate="children"/>');
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
        const group = domHtmlElemOfHtml('<div class="n3q-base n3q-popup-header" data-translate="children"/>');

        const icon = <HTMLImageElement> domHtmlElemOfHtml('<img class="n3q-base n3q-popup-icon"/>');
        icon.src = imgPopupIcon;
        group.append(icon);

        const title = domHtmlElemOfHtml('<div class="n3q-base n3q-popup-title" data-translate="text:Popup.title">Your Weblin</div>');
        group.append(title);

        const description = domHtmlElemOfHtml('<div class="n3q-base n3q-popup-description" data-translate="text:Popup.description">Change name and avatar, then reload the page.</div>');
        group.append(description);

        const iconDispatcher = PointerEventDispatcher.makeDispatcher(this, icon);
        iconDispatcher.addListener('click', DomButtonId.first, DomModifierKeyId.control, ev => this.devConfig(group));
        iconDispatcher.addUnmodifiedLeftdoubleclickListener(ev => this.devConfig(group));

        return group;
    }

    private makeNicknameGroupHtml(nickname: string): HTMLElement
    {
        const nicknameGroup = domHtmlElemOfHtml('<div class="n3q-base n3q-popup-group n3q-popup-group-nickname" data-translate="children"/>');

        const label = domHtmlElemOfHtml('<div class="n3q-base n3q-popup-label" data-translate="text:Popup">Name</div>');
        nicknameGroup.append(label);

        this.nicknameElem = <HTMLInputElement> domHtmlElemOfHtml(`<input type="text" id="n3q-id-popup-nickname" class="n3q-base" value="${nickname}"/>`);
        nicknameGroup.append(this.nicknameElem);

        const button = domHtmlElemOfHtml('<button class="n3q-base n3q-popup-random" data-translate="text:Popup">Random</button>');
        PointerEventDispatcher.makeOpaqueDispatcher(this, button).addUnmodifiedLeftclickListener(ev => {
            this.nicknameElem.value = RandomNames.getRandomNickname();
        });
        nicknameGroup.append(button);

        return nicknameGroup;
    }

    private makeAvatarGroupHtml(): HTMLElement
    {
        const group = domHtmlElemOfHtml('<div class="n3q-base n3q-popup-group n3q-popup-group-avatar" data-translate="children"/>');

        const avatarGallery = domHtmlElemOfHtml('<div class="n3q-base n3q-popup-group-avatar-gallery" data-translate="children"/>');
        const label = domHtmlElemOfHtml('<div class="n3q-base n3q-popup-label" data-translate="text:Popup">Avatar</div>');
        const left = domHtmlElemOfHtml('<button class="n3q-base n3q-popup-avatar-arrow n3q-popup-avatar-left">&lt;</button>');
        const avatarImgWrapElem = domHtmlElemOfHtml('<div class="n3q-base n3q-popup-avatar-current"/>');
        const avatarImgElem = <HTMLImageElement> domHtmlElemOfHtml('<img class="n3q-base"/>');
        avatarImgWrapElem.append(avatarImgElem);
        const right = domHtmlElemOfHtml('<button class="n3q-base n3q-popup-avatar-arrow n3q-popup-avatar-right">&gt;</button>');
        avatarGallery.append(label);
        avatarGallery.append(left);
        avatarGallery.append(avatarImgWrapElem);
        avatarGallery.append(right);
        group.append(avatarGallery);

        avatarImgElem.src = this.currentAvatar.getPreviewUrl();
        PointerEventDispatcher.makeOpaqueDispatcher(this, left).addUnmodifiedLeftclickListener(ev => {
            this.currentAvatar = this.currentAvatar.getPreviousAvatar();
            avatarImgElem.src = this.currentAvatar.getPreviewUrl();
        });
        PointerEventDispatcher.makeOpaqueDispatcher(this, right).addUnmodifiedLeftclickListener(ev => {
            this.currentAvatar = this.currentAvatar.getNextAvatar();
            avatarImgElem.src = this.currentAvatar.getPreviewUrl();
        });

        const avatarGenUrl = Config.get('settings.avatarGeneratorLink', 'https://www.weblin.io/Avatars');
        const avatarGenBlock = domHtmlElemOfHtml(''
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
        const group = domHtmlElemOfHtml('<div class="n3q-base n3q-popup-group n3q-popup-group-save" data-translate="children"/>');

        const saving = domHtmlElemOfHtml('<div class="n3q-base n3q-popup-save-saving" data-translate="text:Popup">Saving</div>');

        const save = domHtmlElemOfHtml('<button class="n3q-base n3q-popup-save" data-translate="text:Popup">Save</button>');
        PointerEventDispatcher.makeOpaqueDispatcher(this, save).addUnmodifiedLeftclickListener(ev => {
            const transition = {property: 'opacity', duration: '0.2s'};
            const nickname2Save = this.nicknameElem.value;
            startDomElemTransition(saving, null, transition, '1', () => {
                Memory.setLocal(Utils.localStorageKey_Nickname(), nickname2Save)
                .then(() => this.currentAvatar.setAvatarInLocalMemory())
                .then(() => BackgroundMessage.userSettingsChanged())
                .then(() => {
                    const transition = {property: 'opacity', duration: '1s'};
                    startDomElemTransition(saving, null, transition, '0', () => this.close());
                }).catch(error => log.info(error));
            });
        });
        group.append(save);
        group.append(saving);

        const close = domHtmlElemOfHtml('<button class="n3q-base n3q-popup-close" data-translate="text:Common">Close</button>');
        PointerEventDispatcher.makeOpaqueDispatcher(this, close).addUnmodifiedLeftclickListener(ev => this.close());
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
            dev = domHtmlElemOfHtml('<div id="n3q-popup-dev" class="n3q-base n3q-popup-hidden"/>');
            const text = <HTMLTextAreaElement> domHtmlElemOfHtml('<textarea class="n3q-base n3q-popup-dev-in" style="width: 100%; height: 100px; margin-top: 1em;"/>');
            PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this, text);
            Memory.getLocal(customCfgStorageKey, this.defaultDevConfig).then(data => {
                text.value = data;
                dev.append(text);
                const apply = domHtmlElemOfHtml('<button class="n3q-base n3q-popup-dev-apply" style="margin-top: 0.5em;">Save</button>');
                PointerEventDispatcher.makeOpaqueDispatcher(this, apply).addUnmodifiedLeftclickListener(ev => {
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
