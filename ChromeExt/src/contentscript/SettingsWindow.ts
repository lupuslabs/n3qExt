import log = require('loglevel');
import { is } from '../lib/is';
import { as } from '../lib/as'
import { Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { Memory } from '../lib/Memory';
import { Client } from '../lib/Client';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { AvatarGallery, GalleryAvatar } from '../lib/AvatarGallery';
import { RandomNames } from '../lib/RandomNames';
import { DomUtils } from '../lib/DomUtils';
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { ContentApp } from './ContentApp';
import { FullWindow, FullWindowOptions } from './FullWindow';

import * as imgPopupIcon from '../assets/PopupIcon.png';

export class SettingsWindow extends FullWindow<FullWindowOptions>
{
    private scrollPaneElem: HTMLElement;

    private currentAvatar: GalleryAvatar;
    private avatarImgElem: null|HTMLImageElement;
    private nicknameInputElem: null|HTMLInputElement;
    private userConfigBackupLabelElem: null|HTMLElement;
    private userConfigBackupInputElem: null|HTMLTextAreaElement;
    private userConfigBackupSectionVisible: boolean = false;
    private devConfigLabelElem: null|HTMLElement;
    private devConfigInputElem: null|HTMLTextAreaElement;
    private devConfigSectionVisible: boolean = false;

    public constructor(app: ContentApp)
    {
        super(app);
        this.windowCssClasses.push('settingswindow');
        this.titleText = 'Settings';
        this.titleTextId = 'Settingswindow.Settings';
        this.defaultBottom = 150;
        this.defaultLeft = 50;
        this.contentAdditionalWidth = as.Int(Config.get('settings.contentAdditionalWidth', 0))
        this.contentAdditionalHeight = as.Int(Config.get('settings.contentAdditionalHeight', 0))
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        this.makeHeaderSection();

        this.scrollPaneElem = DomUtils.elemOfHtml('<div class="scroll-content" data-translate="children"/>');
        this.contentElem.append(this.scrollPaneElem);

        const avatars = new AvatarGallery();
        this.currentAvatar = await avatars.getAvatarFromLocalMemory();

        await this.makeUserConfigBackupSection().catch(error => this.app.onError(error));
        await this.makeDevConfigSection().catch(error => this.app.onError(error));
        this.makeNicknameSection();
        this.makeAvatarSection();

        this.makeFooterSection();
    }

    private makeHeaderSection(): void
    {
        const sectionElem = DomUtils.elemOfHtml('<div class="header-section" data-translate="children"/>');

        const icon = <HTMLImageElement> DomUtils.elemOfHtml('<img class="logo"/>');
        icon.src = imgPopupIcon;
        sectionElem.append(icon);

        const title = DomUtils.elemOfHtml('<div class="title" data-translate="text:Popup.title">Your Weblin</div>');
        sectionElem.append(title);

        const description = DomUtils.elemOfHtml('<div class="description" data-translate="text:Popup.description">Change name and avatar, then reload the page.</div>');
        sectionElem.append(description);

        const iconDispatcher = PointerEventDispatcher.makeDispatcher(this.app, icon);
        iconDispatcher.addUnmodifiedLeftClickListener(ev => this.toggleUserConfigBackupVisibility());
        iconDispatcher.addCtrlLeftClickListener(ev => this.toggleDevConfigVisibility());

        this.contentElem.append(sectionElem);
    }

    private makeNicknameSection(): void
    {
        const fieldId = DomUtils.makeUniqueElemId();

        this.scrollPaneElem.append(DomUtils.elemOfHtml(`<label for="${fieldId}" class="label nickname-label" data-translate="text:Popup">Name</label>`));

        const containerElem = DomUtils.elemOfHtml('<div class="nickname-container"/>');
        this.scrollPaneElem.append(containerElem);

        this.nicknameInputElem = <HTMLInputElement> DomUtils.elemOfHtml(`<input type="text" id="${fieldId}" value="${this.app.getUserName()}"/>`);
        containerElem.append(this.nicknameInputElem);

        const buttonElem = this.app.uiHelper.makeDefaultTextButton('randomize-nickname-button', 'Popup.Random', 'Random', () => {
            this.nicknameInputElem.value = RandomNames.getRandomNickname();
        });
        containerElem.append(buttonElem);
    }

    private makeAvatarSection(): void
    {
        this.updateCurrentAvatar(this.currentAvatar);

        this.scrollPaneElem.append(DomUtils.elemOfHtml('<div class="label" data-translate="text:Popup">Avatar</div>'));
        const avatarGallery = DomUtils.elemOfHtml('<div class="avatar-gallery" data-translate="children"/>');
        const leftElem = this.app.uiHelper.makeButton({
            style: 'default',
            extraCssClass: 'avatar-arrow avatar-left',
            text: '<',
            onClick: () => this.updateCurrentAvatar(this.currentAvatar.getPreviousAvatar()),
        })[0];
        avatarGallery.append(leftElem);
        const avatarImgWrapElem = DomUtils.elemOfHtml('<div class="avatar-current"/>');
        this.avatarImgElem = <HTMLImageElement> DomUtils.elemOfHtml('<img/>');
        avatarImgWrapElem.append(this.avatarImgElem);
        avatarGallery.append(avatarImgWrapElem);
        const rightElem = this.app.uiHelper.makeButton({
            style: 'default',
            extraCssClass: 'avatar-arrow avatar-right',
            text: '>',
            onClick: () => this.updateCurrentAvatar(this.currentAvatar.getNextAvatar()),
        })[0];
        avatarGallery.append(rightElem);
        this.scrollPaneElem.append(avatarGallery);

        this.scrollPaneElem.append(DomUtils.elemOfHtml('<div class="label" data-translate="text:Popup"></div>'));
        const avatarGenBlockElem = DomUtils.elemOfHtml('<div class="avatar-generator" data-translate="children">');
        avatarGenBlockElem.append(DomUtils.elemOfHtml('<div data-translate="text:Popup">Create your own avatar</div>'))
        const avatarGenUrl = Config.get('settings.avatarGeneratorLink', 'https://www.weblin.io/Avatars');
        const avatarGenLabel = this.app.translateText('Popup.Avatar Generator', 'Avatar Generator')
        avatarGenBlockElem.append(DomUtils.makeExternalTextLinkElem(avatarGenUrl, avatarGenLabel))
        PointerEventDispatcher.protectElementsWithDefaultActions(this.app, avatarGenBlockElem);
        this.scrollPaneElem.append(avatarGenBlockElem);
    }

    private updateCurrentAvatar(currentAvatar): void {
        this.currentAvatar = currentAvatar;
        const previewUrlRaw = currentAvatar.getPreviewUrl();
        BackgroundMessage.fetchUrlAsDataUrl(previewUrlRaw, '')
            .catch(error => previewUrlRaw)
            .then(previewUrlData => {
                if (currentAvatar === this.currentAvatar) {
                    this.avatarImgElem.src = previewUrlData;
                }
            });
    }

    private makeFooterSection(): void
    {
        const sectionElem = DomUtils.elemOfHtml('<div class="footer-section" data-translate="children"/>');

        const savingIndicator = DomUtils.elemOfHtml('<div class="saving-indicator" data-translate="text:Popup">Saving</div>');
        const saveButton = this.app.uiHelper.makeDefaultTextButton('save-button', 'Popup.Save', 'Save', () => {
            const transition = {property: 'opacity', duration: '0.2s'};
            const nickname2Save = this.nicknameInputElem.value;
            DomUtils.startElemTransition(savingIndicator, null, transition, '1', () =>
                Memory.setLocal(Utils.localStorageKey_Nickname(), nickname2Save).catch(error => log.info(error))
                .then(() => this.currentAvatar.setAvatarInLocalMemory()).catch(error => log.info(error))
                .then(() => this.saveUserConfig()).catch(error => log.info(error))
                .then(() => this.saveDevConfig()).catch(error => log.info(error))
                .then(() => BackgroundMessage.userSettingsChanged()).catch(error => log.info(error))
                .then(() => {
                    const transition = {property: 'opacity', duration: '1s'};
                    DomUtils.startElemTransition(savingIndicator, null, transition, '0', () => this.close());
                }).catch(error => log.info(error))
            );
        });
        sectionElem.append(saveButton);
        sectionElem.append(savingIndicator);

        this.contentElem.append(sectionElem);
    }

    private async makeUserConfigBackupSection(): Promise<void>
    {
        const inputId = DomUtils.makeUniqueElemId();

        this.userConfigBackupLabelElem = DomUtils.elemOfHtml(`<label class="label danger user-config-label" for="${inputId}">Config backup</label>`);
        this.scrollPaneElem.append(this.userConfigBackupLabelElem);

        this.userConfigBackupInputElem = <HTMLTextAreaElement> DomUtils.elemOfHtml(`<textarea id="${inputId}" class="danger user-config-input"/>`);
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.userConfigBackupInputElem);
        const userConfigJson = await Client.loadUserConfigJson();
        const userConfigBase64 = Utils.base64Encode(userConfigJson);
        this.userConfigBackupInputElem.value = userConfigBase64;
        this.scrollPaneElem.append(this.userConfigBackupInputElem);

        this.userConfigBackupSectionVisible = true;
        this.toggleUserConfigBackupVisibility();
    }

    private toggleUserConfigBackupVisibility(): void
    {
        this.userConfigBackupSectionVisible = !this.userConfigBackupSectionVisible;
        DomUtils.setElemClassPresent(this.userConfigBackupLabelElem, 'removed', !this.userConfigBackupSectionVisible);
        DomUtils.setElemClassPresent(this.userConfigBackupInputElem, 'removed', !this.userConfigBackupSectionVisible);
        this.updateScrollPaneRowSizing()
    }

    private async saveUserConfig(): Promise<void> {
        if (!this.userConfigBackupSectionVisible) {
            return;
        }
        const userConfigBase64OrJson = this.userConfigBackupInputElem.value;
        let userConfigJson = '';
        if (userConfigBase64OrJson.startsWith('{')) {
            userConfigJson = userConfigBase64OrJson;
        } else {
            userConfigJson = Utils.base64Decode(userConfigBase64OrJson);
        }
        await Client.saveUserConfigJson(userConfigJson)
    }

    private async makeDevConfigSection(): Promise<void>
    {
        const inputId = DomUtils.makeUniqueElemId();

        this.devConfigLabelElem = DomUtils.elemOfHtml(`<label class="label danger dev-config-label" for="${inputId}">Debug config</label>`);
        this.scrollPaneElem.append(this.devConfigLabelElem);

        this.devConfigInputElem = <HTMLTextAreaElement> DomUtils.elemOfHtml(`<textarea id="${inputId}" class="danger dev-config-input"/>`);
        this.devConfigInputElem.value = await Client.loadDevConfigJson();
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, this.devConfigInputElem);
        this.scrollPaneElem.append(this.devConfigInputElem);

        this.devConfigSectionVisible = true;
        this.toggleDevConfigVisibility();
    }

    private async saveDevConfig(): Promise<void> {
        if (!this.devConfigSectionVisible) {
            return;
        }
        let devConfigString = this.devConfigInputElem.value;
        if (!is.nonEmptyString(devConfigString)) {
            devConfigString = '{}';
        }
        await Client.saveDevConfigJson(devConfigString);
    }

    private toggleDevConfigVisibility(): void
    {
        this.devConfigSectionVisible = !this.devConfigSectionVisible;
        DomUtils.setElemClassPresent(this.devConfigLabelElem, 'removed', !this.devConfigSectionVisible);
        DomUtils.setElemClassPresent(this.devConfigInputElem, 'removed', !this.devConfigSectionVisible);
        this.updateScrollPaneRowSizing()
    }

    private updateScrollPaneRowSizing(): void
    {
        const rowHeights = [];
        if (this.userConfigBackupSectionVisible) {
            rowHeights.push('1fr');
        }
        if (this.devConfigSectionVisible) {
            rowHeights.push('1fr');
        }
        this.scrollPaneElem.style.gridTemplateRows = rowHeights.join(' ');
    }

}
