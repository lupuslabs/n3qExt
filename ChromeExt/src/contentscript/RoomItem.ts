import imgDefaultItem from '../assets/DefaultItem.png';

import * as $ from 'jquery';
import log = require('loglevel');
import { as } from '../lib/as';
import { Utils } from '../lib/Utils';
import { Config } from '../lib/Config';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { ItemProperties, Pid } from '../lib/ItemProperties';
import { Memory } from '../lib/Memory';
import { ItemException } from '../lib/ItemException';
import { Payload } from '../lib/Payload';
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi';
import { SimpleErrorToast, SimpleToast } from './Toast';
import { ContentApp } from './ContentApp';
import { Entity } from './Entity';
import { Room } from './Room';
import { Avatar } from './Avatar';
import { RoomItemStats } from './RoomItemStats';
import { ItemFrameUnderlay } from './ItemFrameUnderlay';
import { ItemFrameWindow, ItemFrameWindowOptions } from './ItemFrameWindow';
import { ItemFramePopup } from './ItemFramePopup';
import { Participant } from './Participant';

export class RoomItem extends Entity
{
    private properties: { [pid: string]: string } = {};
    private providerId: string;
    private frameWindow: ItemFrameWindow;
    private framePopup: ItemFramePopup;
    private isFirstPresence: boolean = true;
    protected statsDisplay: RoomItemStats;
    protected screenUnderlay: ItemFrameUnderlay;
    protected myItem: boolean = false;
    protected state = '';

    constructor(app: ContentApp, room: Room, roomNick: string, isSelf: boolean)
    {
        super(app, room, roomNick, isSelf);

        $(this.getElem()).addClass('n3q-item');
        $(this.getElem()).attr('data-nick', roomNick);

        if (Utils.isBackpackEnabled()) {
            $(this.getElem()).hover(() =>
            {
                this.statsDisplay?.close();
                this.statsDisplay = new RoomItemStats(this.app, this, () => { this.statsDisplay = null; });
                this.statsDisplay.show();
            }, () =>
            {
                this.statsDisplay?.close();
            });
        }
    }

    isMyItem(): boolean { return this.myItem; }
    getDefaultAvatar(): string { return imgDefaultItem; }
    getRoomNick(): string { return this.roomNick; }
    getDisplayName(): string { return as.String(this.getProperties()[Pid.Label], this.roomNick); }

    getProperties(pids: Array<string> = null): any
    {
        if (pids == null) {
            return this.properties;
        }
        let filteredProperties = new ItemProperties();
        for (let pid in this.properties) {
            if (pids.includes(pid)) {
                filteredProperties[pid] = this.properties[pid];
            }
        }
        return filteredProperties;
    }

    setProperties(props: ItemProperties)
    {
        let changed = !ItemProperties.areEqual(this.properties, props)
        if (changed) {
            this.properties = props;

            // if (as.Bool(this.properties[Pid.IframeLive], false)) {
            //     this.sendMessageToScriptFrame(new WeblinClientIframeApi.ItemGetPropertiesResponse(this.properties));
            // }
            this.sendItemPropertiesToAllScriptFrames();
        }
    }

    getScriptWindow(): Window
    {
        let frameElem = null;
        if (this.framePopup) {
            frameElem = this.framePopup.getIframeElem();
        } else if (this.frameWindow) {
            frameElem = this.frameWindow.getIframeElem();
        }
        if (frameElem) {
            return frameElem.contentWindow;
        }
        return null;
    }

    remove(): void
    {
        this.avatarDisplay?.stop();
        this.closeFrame();
        super.remove();
    }

    // presence

    async onPresenceAvailable(stanza: any): Promise<void>
    {
        let hasPosition: boolean = false;
        let newX: number = 123;

        let vpAnimationsUrl = '';
        let vpImageUrl = '';
        let vpRezzedX = -1;

        let newProviderId: string = '';
        let newProperties: ItemProperties = {};

        let isFirstPresence = this.isFirstPresence;
        this.isFirstPresence = false;

        // Collect info

        {
            let stateNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'firebat:avatar:state');
            if (stateNode) {
                let positionNode = stateNode.getChild('position');
                if (positionNode) {
                    newX = as.Int(positionNode.attrs.x, -1);
                    if (newX != -1) {
                        hasPosition = true;
                    }
                }
            }
        }

        if (isFirstPresence) {
            this.myItem = await BackgroundMessage.isBackpackItem(this.roomNick);
        }

        if (this.myItem) {
            try {
                newProperties = await BackgroundMessage.getBackpackItemProperties(this.roomNick);
                newProviderId = as.String(newProperties[Pid.Provider], '');
            } catch (error) {
                log.debug('RoomItem.onPresenceAvailable', 'no properties for', this.roomNick);
            }
        } else {
            let vpPropsNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:props');
            if (vpPropsNode) {
                let attrs = vpPropsNode.attrs;
                if (attrs) {
                    newProviderId = as.String(attrs.provider, '');

                    for (let attrName in attrs) {
                        newProperties[attrName] = attrs[attrName];
                    }
                }
            }
        }

        this.providerId = newProviderId;

        if (newProperties && newProviderId != '') {
            this.setProperties(newProperties);
        }

        vpAnimationsUrl = as.String(newProperties[Pid.AnimationsUrl], '');
        vpImageUrl = as.String(newProperties[Pid.ImageUrl], '');
        vpRezzedX = as.Int(newProperties[Pid.RezzedX], -1);

        // Do someting with the data

        if (isFirstPresence) {
            if (this.myItem) {
                this.app.incrementRezzedItems(newProperties[Pid.Label] + ' ' + newProperties[Pid.Id]);
            }
        }

        if (isFirstPresence) {
            let props = newProperties;
            if (as.Bool(props[Pid.ClaimAspect], false)) {
                // The new item has a claim
                let claimingRoomItem = this.room.getPageClaimItem();
                if (claimingRoomItem) {
                    // There already is a claim
                    if (this.myItem) {
                        // The new item is my own item
                        // Should remove the lesser one of my 2 claim items
                    } else {
                        // The new item is a remote item
                        if (! await this.room.propsClaimDefersToExistingClaim(props)) {
                            // The new item is better
                            if (await BackgroundMessage.isBackpackItem(claimingRoomItem.getRoomNick())) {
                                // The existing claim is mine
                                await BackgroundMessage.derezBackpackItem(claimingRoomItem.getRoomNick(), this.room.getJid(), -1, -1, {}, [Pid.AutorezIsActive], {});
                                new SimpleToast(this.app, 'ClaimDerezzed', Config.get('room.claimToastDurationSec', 15), 'notice', this.app.translateText('Toast.Your claim has been removed'), 'A stronger item just appeared').show();
                            }
                        }
                    }
                }
            }
        }

        if (isFirstPresence) {
            this.avatarDisplay = new Avatar(this.app, this, false);
            if (Utils.isBackpackEnabled()) {
                this.avatarDisplay.addClass('n3q-item-avatar');
            }
            if (as.Bool(newProperties[Pid.ApplierAspect], false)) {
                this.avatarDisplay.makeDroppable();
            }
        }

        if (this.avatarDisplay) {
            if (vpAnimationsUrl != '') {
                let proxiedAnimationsUrl = as.String(Config.get('avatars.animationsProxyUrlTemplate', 'https://webex.vulcan.weblin.com/Avatar/InlineData?url={url}')).replace('{url}', encodeURIComponent(vpAnimationsUrl));
                this.avatarDisplay?.updateObservableProperty('AnimationsUrl', proxiedAnimationsUrl);
            } else {
                this.avatarDisplay?.updateObservableProperty('AnimationsUrl', '');
                if (vpImageUrl != '') {
                    this.avatarDisplay?.updateObservableProperty('ImageUrl', vpImageUrl);
                }
            }
        }

        if (this.statsDisplay) {
            this.statsDisplay.update();
        }

        if (isFirstPresence) {
            if (as.Bool(this.getProperties()[Pid.ScreenAspect], false)) {
                this.screenUnderlay = new ItemFrameUnderlay(this.app, this);
                this.screenUnderlay.show();
            }
        } else {
            if (this.screenUnderlay) {
                this.screenUnderlay.update();
            }
        }

        if (newProperties[Pid.Width] && newProperties[Pid.Height]) {
            var w = as.Int(newProperties[Pid.Width], -1);
            var h = as.Int(newProperties[Pid.Height], -1);
            if (w > 0 && h > 0) {
                this.avatarDisplay?.setSize(w, h);
            }
        }

        let newState = as.String(newProperties[Pid.State], '');
        if (newState != this.state) {
            this.avatarDisplay.setState(newState);
            this.state = newState;
        }

        if (vpRezzedX >= 0) {
            newX = vpRezzedX;
        }

        if (isFirstPresence) {
            if (!hasPosition && vpRezzedX < 0) {
                newX = this.isSelf ? await this.app.getSavedPosition() : this.app.getDefaultPosition(this.roomNick);
            }
            if (newX < 0) { newX = 100; }
            this.setPosition(newX);
        } else {
            if (hasPosition || vpRezzedX >= 0) {
                if (this.getPosition() != newX) {
                    this.move(newX);
                }
            }
        }

        if (isFirstPresence) {
            this.show(true, Config.get('room.fadeInSec', 0.3));
        }

        if (isFirstPresence) {
            if (as.Bool(this.getProperties()[Pid.IframeAspect], false)) {
                if (as.Bool(this.getProperties()[Pid.IframeAuto], false)) {
                    this.openFrame(this.getElem());
                }
            }
        }

        if (isFirstPresence) {
            if (as.String(this.getProperties()[Pid.IframeAutoRange], '') != '') {
                this.checkIframeAutoRange();
            }
        }

        if (isFirstPresence) {
            this.sendItemEventToAllScriptFrames({ event: 'rez' });
        }

        if (isFirstPresence) {
            if (this.room?.iAmAlreadyHere()) {
                if (Config.get('roomItem.chatlogItemAppeared', true)) {
                    this.room?.showChatMessage(this.getDisplayName(), 'appeared');
                }
            } else {
                if (Config.get('roomItem.chatlogItemIsPresent', true)) {
                    this.room?.showChatMessage(this.getDisplayName(), 'is present');
                }
            }
        }
    }

    async onPresenceUnavailable(stanza: any): Promise<void>
    {
        if (this.myItem) {
            this.app.decrementRezzedItems(this.getProperties()[Pid.Label] + ' ' + this.getProperties()[Pid.Id]);
        }

        if (as.Bool(this.getProperties()[Pid.IframeAspect], false)) {
            if (as.Bool(this.getProperties()[Pid.IframeLive], false)) {
                this.closeFrame();
            }
        }

        if (Config.get('roomItem.chatlogItemDisappeared', true)) {
            this.room?.showChatMessage(this.getDisplayName(), 'disappeared');
        }

        this.sendItemEventToAllScriptFrames({ event: 'derez' });

        this.remove();
    }

    onMouseClickAvatar(ev: JQuery.Event): void
    {
        super.onMouseClickAvatar(ev);

        if (as.Bool(this.properties[Pid.IframeAspect], false)) {
            let frame = as.String(JSON.parse(as.String(this.properties[Pid.IframeOptions], '{}')).frame, 'Window');
            if (frame == 'Popup') {
                if (this.framePopup) {
                    this.getScriptWindow()?.postMessage({ [Config.get('iframeApi.messageMagicRezactive', 'tr67rftghg_Rezactive')]: true, type: 'Window.Close' }, '*');
                    window.setTimeout(() => { this.framePopup.close(); }, 100);
                } else {
                    this.openFrame(this.getElem());
                }
            } else {
                if (this.frameWindow) {
                    if (this.frameWindow.isOpen()) {
                        this.frameWindow.setVisibility(true);
                        this.frameWindow.toFront();
                    }
                } else {
                    this.openFrame(this.getElem());
                }
            }
        }

        this.statsDisplay?.close();
    }

    onMouseDoubleClickAvatar(ev: JQuery.Event): void
    {
        super.onMouseDoubleClickAvatar(ev);

        if (as.Bool(this.properties[Pid.IframeAspect], false)) {
            if (this.framePopup) {
                let visible = this.framePopup.getVisibility();
                this.framePopup.setVisibility(!visible);
            } else if (this.frameWindow) {
                let visible = this.frameWindow.getVisibility();
                this.frameWindow.setVisibility(!visible);
            }
        }
    }

    onDragAvatarStart(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): void
    {
        super.onDragAvatarStart(ev, ui);
        this.statsDisplay?.close();

        if (this.framePopup) {
            this.framePopup.close();
        }
    }

    onDragAvatarStop(ev: JQueryMouseEventObject, ui: JQueryUI.DraggableEventUIParams): void
    {
        if (!this.isDerezzing) {
            let dX = ui.position.left - this.dragStartPosition.left;
            let newX = this.getPosition() + dX;
            this.onDraggedTo(newX);
        }
    }

    async onDraggedTo(newX: number): Promise<void>
    {
        if (this.getPosition() != newX) {
            let itemId = this.roomNick;
            if (this.myItem) {
                BackgroundMessage.modifyBackpackItemProperties(itemId, { [Pid.RezzedX]: '' + newX }, [], {});
            } else {
                this.quickSlide(newX);
            }
        }
    }

    onQuickSlideReached(newX: number): void
    {
        super.onQuickSlideReached(newX);

        if (as.String(this.getProperties()[Pid.IframeAutoRange], '') != '') {
            this.checkIframeAutoRange();
        }
    }

    sendMoveMessage(newX: number): void
    {
    }

    async onMoveDestinationReached(newX: number): Promise<void>
    {
        super.onMoveDestinationReached(newX);

        let itemId = this.roomNick;
        if (this.myItem) {
            let props = await BackgroundMessage.getBackpackItemProperties(itemId);
            if (as.Bool(props[Pid.IframeLive], false)) {

                let itemData = {
                    id: itemId,
                    x: newX,
                    isOwn: this.myItem,
                    properties: this.properties,
                };

                this.sendMessageToScriptFrame(new WeblinClientIframeApi.ItemMovedNotification(itemData, newX));
            }
        }

        if (as.String(this.getProperties()[Pid.IframeAutoRange], '') != '') {
            this.checkIframeAutoRange();
        }
    }

    async applyItem(passiveItem: RoomItem)
    {
        let itemId = this.roomNick;
        let passiveItemId = passiveItem.getRoomNick();

        if (this.framePopup) {
            this.getScriptWindow()?.postMessage({ [Config.get('iframeApi.messageMagicRezactive', 'tr67rftghg_Rezactive')]: true, type: 'Window.Close' }, '*');
            window.setTimeout(() => { this.framePopup.close(); }, 100);
        }

        if (!await BackgroundMessage.isBackpackItem(passiveItemId)) {
            let fact = ItemException.fact2String(ItemException.Fact.NotApplied);
            let reason = ItemException.reason2String(ItemException.Reason.NotYourItem);
            let detail = passiveItemId;
            new SimpleErrorToast(this.app, 'Warning-' + fact + '-' + reason, Config.get('room.applyItemErrorToastDurationSec', 5), 'warning', fact, reason, detail).show();
            return;
        }

        if (this.myItem) {
            try {
                await BackgroundMessage.executeBackpackItemAction(itemId, 'Applier.Apply', { 'passive': passiveItemId }, [itemId, passiveItemId]);
                if (Config.get('points.enabled', false)) {
                    /* await */ BackgroundMessage.pointsActivity(Pid.PointsChannelItemApply, 1);
                }
            } catch (ex) {
                // new SimpleErrorToast(this.app, 'Warning-' + error.fact + '-' + error.reason, Config.get('room.applyItemErrorToastDurationSec', 5), 'warning', error.fact, error.reason, error.detail).show();
                let fact = ItemException.factFrom(ex.fact);
                let reason = ItemException.reasonFrom(ex.reason);
                let detail = ex.detail;
                new SimpleErrorToast(this.app, 'Warning-' + fact + '-' + reason, Config.get('room.applyItemErrorToastDurationSec', 5), 'warning', ItemException.fact2String(fact), ItemException.reason2String(reason), detail).show();
            }
        }
    }

    private isDerezzing: boolean = false;
    beginDerez(): void
    {
        this.isDerezzing = true;
        $(this.getElem()).hide().delay(1000).show(0);
    }

    endDerez(): void
    {
        this.isDerezzing = false;
    }

    positionItemFrame(itemId: string, width: number, height: number, left: number, bottom: number)
    {
        this.positionFrame(width, height, left, bottom);
    }

    sendMessageToScreenItemFrame(message: any)
    {
        this.screenUnderlay?.sendMessage(message);
    }

    async openDocumentUrl(aboveElem: HTMLElement)
    {
        let url = as.String(this.properties[Pid.DocumentUrl], null);
        let room = this.app.getRoom();
        let apiUrl = Config.get('itemProviders.' + this.providerId + '.config.' + 'apiUrl', '');
        let userId = await Memory.getLocal(Utils.localStorageKey_Id(), '');

        if (url != '' && room && apiUrl != '' && userId != '') {
            let tokenOptions = {};
            if (this.myItem) {
                tokenOptions['properties'] = await BackgroundMessage.getBackpackItemProperties(this.roomNick);
            } else {
                tokenOptions['properties'] = this.properties;
            }
            let contextToken = await Payload.getContextToken(apiUrl, userId, this.roomNick, 600, { 'room': room.getJid() }, tokenOptions);
            url = url.replace('{context}', encodeURIComponent(contextToken));

            let documentOptions = JSON.parse(as.String(this.properties[Pid.DocumentOptions], '{}'));
            this.openIframeAsWindow(aboveElem, url, documentOptions);
        }
    }

    checkIframeAutoRange()
    {
        let range = Utils.parseStringMap(as.String(this.getProperties()[Pid.IframeAutoRange], ''));
        this.showItemRange(true, range);
        if (this.isInRange(this.room?.getParticipant(this.room.getMyNick()), range)) {
            this.openFrame(this.getElem());
        } else {
            this.closeFrame();
        }
    }

    isInRange(participant: Participant, range: any)
    {
        let x = participant.getPosition();

        let itemRect = this.elem.getBoundingClientRect();
        let absPos = Math.floor(itemRect.x + itemRect.width / 2);
        let absRangeLeft = absPos + as.Int(range['left'], 0);
        let absRangeRight = absPos + as.Int(range['right'], 0);

        let isInRange = x >= absRangeLeft && x <= absRangeRight;
        return isInRange;
    }

    async openFrame(clickedElem: HTMLElement)
    {
        let iframeUrl = as.String(this.properties[Pid.IframeUrl], null);
        let room = this.app.getRoom();
        let apiUrl = Config.get('itemProviders.' + this.providerId + '.config.' + 'apiUrl', '');
        let userId = await Memory.getLocal(Utils.localStorageKey_Id(), '');

        if (iframeUrl != '' && room && apiUrl != '' && userId != '') {
            //iframeUrl = 'https://jitsi.vulcan.weblin.com/{room}#userInfo.displayName="{name}"';
            //iframeUrl = 'https://jitsi.vulcan.weblin.com/8lgGTypkGd#userInfo.displayName="{name}"';
            //iframeUrl = 'https://meet.jit.si/example-103#interfaceConfig.TOOLBAR_BUTTONS=%5B%22microphone%22%2C%22camera%22%2C%22desktop%22%2C%22fullscreen%22%2C%22hangup%22%2C%22profile%22%2C%22settings%22%2C%22videoquality%22%5D&interfaceConfig.SETTINGS_SECTIONS=%5B%22devices%22%2C%22language%22%5D&interfaceConfig.TOOLBAR_ALWAYS_VISIBLE=false';

            let roomJid = room.getJid();
            let tokenOptions = {};
            tokenOptions['properties'] = this.properties;
            try {
                let contextToken = await Payload.getContextToken(apiUrl, userId, this.roomNick, 600, { 'room': roomJid }, tokenOptions);
                let participantDisplayName = this.room.getParticipant(this.room.getMyNick()).getDisplayName();

                iframeUrl = iframeUrl
                    .replace('{context}', encodeURIComponent(contextToken))
                    .replace('{room}', encodeURIComponent(roomJid))
                    .replace('{name}', encodeURIComponent(participantDisplayName))
                    ;

                iframeUrl = iframeUrl.replace(/"/g, '%22');

                let iframeOptions = JSON.parse(as.String(this.properties[Pid.IframeOptions], '{}'));
                if (as.String(iframeOptions.frame, 'Window') == 'Popup') {
                    this.openIframeAsPopup(clickedElem, iframeUrl, iframeOptions);
                } else {
                    this.openIframeAsWindow(clickedElem, iframeUrl, iframeOptions);
                }
            } catch (error) {
                log.info('RepositoryItem.openIframe', error);
            }
        }
    }

    closeFrame()
    {
        if (this.framePopup) {
            this.framePopup.close();
            this.framePopup = null;
        } else if (this.frameWindow) {
            this.frameWindow.close();
            this.frameWindow = null;
        }
    }

    setFrameVisibility(visible: boolean)
    {
        if (this.framePopup) {
            this.framePopup.setVisibility(visible);
        } else if (this.frameWindow) {
            this.frameWindow.setVisibility(visible);
        }
    }

    openIframeAsPopup(clickedElem: HTMLElement, iframeUrl: string, frameOptions: any)
    {
        if (this.framePopup == null) {
            this.framePopup = new ItemFramePopup(this.app);

            let options: ItemFrameWindowOptions = {
                item: this,
                elem: clickedElem,
                url: iframeUrl,

                onClose: () => { this.framePopup = null; },
                width: as.Int(frameOptions.width, 100),
                height: as.Int(frameOptions.height, 100),
                left: as.Int(frameOptions.left, -frameOptions.width / 2),
                bottom: as.Int(frameOptions.bottom, 50),
                resizable: as.Bool(frameOptions.rezizable, true),
                transparent: as.Bool(frameOptions.transparent, false),
                hidden: as.Bool(frameOptions.hidden, false),
            }

            this.framePopup.show(options);
        }
    }

    openIframeAsWindow(clickedElem: HTMLElement, iframeUrl: string, windowOptions: any)
    {
        if (this.frameWindow == null) {
            this.frameWindow = new ItemFrameWindow(this.app);

            let options: ItemFrameWindowOptions = {
                item: this,
                elem: clickedElem,
                url: iframeUrl,
                onClose: () => { this.frameWindow = null; },
                width: as.Int(windowOptions.width, 100),
                height: as.Int(windowOptions.height, 100),
                left: as.Int(windowOptions.left, -windowOptions.width / 2),
                bottom: as.Int(windowOptions.bottom, 50),
                resizable: as.Bool(windowOptions.rezizable, true),
                undockable: as.Bool(windowOptions.undockable, false),
                transparent: as.Bool(windowOptions.transparent, false),
                hidden: as.Bool(windowOptions.hidden, false),
                titleText: as.String(this.properties[Pid.Description], as.String(this.properties[Pid.Label], 'Item')),
            }

            this.frameWindow.show(options);
        }
    }

    positionFrame(width: number, height: number, left: number, bottom: number, options: any = null)
    {
        this.framePopup?.position(width, height, left, bottom, options);
        this.frameWindow?.position(width, height, left, bottom);
    }

    toFrontFrame()
    {
        this.framePopup?.toFront();
        this.frameWindow?.toFront();
    }

    async setItemProperty(pid: string, value: any)
    {
        if (await BackgroundMessage.isBackpackItem(this.roomNick)) {
            await BackgroundMessage.modifyBackpackItemProperties(this.roomNick, { [pid]: value }, [], {});
        }
    }

    async setItemState(state: string)
    {
        if (await BackgroundMessage.isBackpackItem(this.roomNick)) {
            await BackgroundMessage.modifyBackpackItemProperties(this.roomNick, { [Pid.State]: state }, [], {});
        }
    }

    async setItemCondition(condition: string)
    {
        this.avatarDisplay?.setCondition(condition);
    }

    async showItemRange(visible: boolean, range: any)
    {
        if (visible) {
            this.setRange(range.left, range.right);
        } else {
            this.removeRange();
        }
    }

    sendItemEventToAllScriptFrames(data: any): void
    {
        let itemData = {
            id: this.getRoomNick(),
            x: this.getPosition(),
            isOwn: this.isMyItem(),
            properties: this.getProperties([Pid.Template, Pid.OwnerId]),
        };

        let itemIds = this.room.getAllScriptedItems();
        for (let i = 0; i < itemIds.length; i++) {
            this.room.getItem(itemIds[i])?.sendMessageToScriptFrame(new WeblinClientIframeApi.ItemEventNotification(itemData, data));
        }
    }

    sendItemPropertiesToAllScriptFrames(): void
    {
        let itemIds = this.room.getAllScriptedItems();
        for (let i = 0; i < itemIds.length; i++) {
            this.room.getItem(itemIds[i])?.sendMessageToScriptFrame(new WeblinClientIframeApi.ItemPropertiesChangedNotification(this.roomNick, this.properties));
        }
    }

    sendMessageToScriptFrame(message: any)
    {
        message[Config.get('iframeApi.messageMagicRezactive', 'tr67rftghg_Rezactive')] = true;
        this.getScriptWindow()?.postMessage(message, '*');
    }

}
