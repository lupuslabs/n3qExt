import imgDefaultItem from '../assets/DefaultItem.png';

import * as $ from 'jquery';
import log = require('loglevel');
import { is } from '../lib/is';
import { as } from '../lib/as';
import { ErrorWithData, Utils } from '../lib/Utils';
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
import { ItemFramePopup, ItemFramePopupOptions } from './ItemFramePopup';
import { Participant } from './Participant';
import { BackpackItem } from './BackpackItem';
import { Element as XmlElement } from 'ltx';
import { DomButtonId } from '../lib/domTools';
import { DomModifierKeyId, PointerEventData } from '../lib/PointerEventData';

export class RoomItem extends Entity
{
    private properties: { [pid: string]: string } = {};
    private frameWindow: ItemFrameWindow;
    private framePopup: ItemFramePopup;
    private isFirstPresence: boolean = true;
    protected statsDisplay: RoomItemStats;
    protected screenUnderlay: ItemFrameUnderlay;
    protected myItem: boolean = false;
    protected state = '';
    protected ownerName = 'unknown';
    private statsDisplayOpenTimeout: number|null = null;
    private statsDisplayCloseTimeout: number|null = null;

    constructor(app: ContentApp, room: Room, roomNick: string, isSelf: boolean)
    {
        super(app, room, roomNick, isSelf);

        $(this.getElem()).addClass('n3q-item');
        $(this.getElem()).attr('data-nick', roomNick);
    }

    public isMyItem(): boolean { return this.myItem; }
    public getDefaultAvatar(): string { return imgDefaultItem; }
    public getItemId(): string { return this.getProperties()[Pid.Id]; }
    public getDisplayName(): string { return as.String(this.getProperties()[Pid.Label], this.getItemId()); }
    public getOwnerName(): string { return this.ownerName; }

    public getProperties(pids: Array<string> = null): ItemProperties
    {
        if (pids == null) {
            return this.properties;
        }
        const filteredProperties = new ItemProperties();
        for (const pid in this.properties) {
            if (pids.includes(pid)) {
                filteredProperties[pid] = this.properties[pid];
            }
        }
        return filteredProperties;
    }

    public setProperties(props: ItemProperties)
    {
        const changed = !ItemProperties.areEqual(this.properties, props);
        if (changed) {
            this.properties = props;

            // if (as.Bool(this.properties[Pid.IframeLive])) {
            //     this.sendMessageToScriptFrame(new WeblinClientIframeApi.ItemGetPropertiesResponse(this.properties));
            // }
            this.sendItemPropertiesToAllScriptFrames();
        }
    }

    protected getScriptWindow(): undefined | Window
    {
        let window = this.framePopup ?? this.frameWindow;
        return window?.getIframeElem()?.contentWindow;
    }

    public remove(): void
    {
        this.avatarDisplay?.stop();
        this.hideStatsDisplay(0);
        this.closeFrame();
        super.remove();
    }

    // presence

    public async onPresenceAvailable(stanza: XmlElement): Promise<void>
    {
        let hasPosition: boolean = false;
        let newX: number = 123;

        let isFirstPresence = this.isFirstPresence;
        this.isFirstPresence = false;

        let stanzaProperties: ItemProperties = {};

        // Collect info

        const parent = as.String(stanza.attrs.parent);
        if (parent !== '') {
            const sender = this.room.getParticipant(parent);
            if (sender) {
                this.ownerName = sender.getDisplayName();
            }
        }

        {
            const vpPropsNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'vp:props');
            if (vpPropsNode) {
                const attrs = vpPropsNode.attrs;
                if (attrs) {
                    for (const attrName in attrs) {
                        stanzaProperties[attrName] = attrs[attrName];
                    }
                }
                this.setProperties(stanzaProperties);
            }
        }

        {
            const stateNode = stanza.getChildren('x').find(stanzaChild => (stanzaChild.attrs == null) ? false : stanzaChild.attrs.xmlns === 'firebat:avatar:state');
            if (stateNode) {
                const positionNode = stateNode.getChild('position');
                if (positionNode) {
                    newX = as.Int(positionNode.attrs.x, -1);
                    if (newX !== -1) {
                        hasPosition = true;
                    }
                }
            }
        }

        if (isFirstPresence) {
            this.myItem = await BackgroundMessage.isBackpackItem(this.getItemId());
        }

        if (this.myItem) {
            try {
                const backpackProperties = await BackgroundMessage.getBackpackItemProperties(this.getItemId());
                this.setProperties(backpackProperties);
            } catch (error) {
                log.debug('RoomItem.onPresenceAvailable', 'no properties for', this.getItemId());
            }
        }

        const vpAnimationsUrl = as.String(this.getProperties()[Pid.AnimationsUrl]);
        const vpImageUrl = as.String(this.getProperties()[Pid.ImageUrl]);
        const vpRezzedX = as.Int(this.getProperties()[Pid.RezzedX], -1);

        // Do something with the data

        if (isFirstPresence) {
            if (this.myItem) {
                this.app.incrementRezzedItems(this.getProperties()[Pid.Label] + ' ' + this.getProperties()[Pid.Id]);
            }
        }

        if (isFirstPresence) {
            const props = this.getProperties();
            if (as.Bool(props[Pid.ClaimAspect])) {
                // The new item has a claim
                const claimingRoomItem = this.room.getPageClaimItem();
                if (claimingRoomItem) {
                    // There already is a claim
                    if (this.myItem) {
                        // The new item is my own item
                        // Should remove the lesser one of my 2 claim items
                    } else {
                        // The new item is a remote item
                        if (! await this.room.propsClaimYieldsToExistingClaim(props)) {
                            // The new item is better
                            if (await BackgroundMessage.isBackpackItem(claimingRoomItem.getItemId())) {
                                // The existing claim is mine
                                this.app.derezItem(claimingRoomItem.getItemId());
                                new SimpleToast(this.app, 'ClaimDerezzed', Config.get('room.claimToastDurationSec', 15), 'notice', this.app.translateText('Toast.Your claim has been removed'), 'A stronger item just appeared').show();
                            }
                        }
                    }
                }
            }
        }

        if (is.nil(this.avatarDisplay)) {
            let visible = true;
            if (as.Bool(this.getProperties()[Pid.IsInvisible]) && !Config.get('room.showInvisibleItems', false)) {
                visible = false;
            }
            this.avatarDisplay = new Avatar(this.app, this, false, visible);
            if (Utils.isBackpackEnabled()) {
                this.avatarDisplay.addClass('n3q-item-avatar');
            }
        }

        if (this.avatarDisplay) {
            if (vpAnimationsUrl !== '') {
                const proxiedAnimationsUrl = as.String(Config.get('avatars.animationsProxyUrlTemplate', 'https://webex.vulcan.weblin.com/Avatar/InlineData?url={url}')).replace('{url}', encodeURIComponent(vpAnimationsUrl));
                this.avatarDisplay?.updateObservableProperty('AnimationsUrl', proxiedAnimationsUrl);
            } else {
                this.avatarDisplay?.updateObservableProperty('AnimationsUrl', '');
                if (vpImageUrl !== '') {
                    this.avatarDisplay?.updateObservableProperty('ImageUrl', vpImageUrl);
                }
            }
        }

        if (this.statsDisplay) {
            this.statsDisplay.update();
        }

        if (is.nil(this.screenUnderlay)) {
            if (as.Bool(this.getProperties()[Pid.ScreenAspect])) {
                this.screenUnderlay = new ItemFrameUnderlay(this.app, this);
                this.screenUnderlay.show();
            }
        } else {
            if (this.screenUnderlay) {
                this.screenUnderlay.update();
            }
        }

        if (this.getProperties()[Pid.Width] && this.getProperties()[Pid.Height]) {
            const w = as.Int(this.getProperties()[Pid.Width], -1);
            const h = as.Int(this.getProperties()[Pid.Height], -1);
            if (w > 0 && h > 0) {
                this.avatarDisplay?.setSize(w, h);
            }
        }

        const newState = as.String(this.getProperties()[Pid.State]);
        if (newState !== this.state) {
            this.avatarDisplay.setState(newState);
            this.state = newState;
        }

        if (vpRezzedX >= 0) {
            newX = vpRezzedX;
        }

        if (isFirstPresence) {
            if (!hasPosition && vpRezzedX < 0) {
                newX = this.isSelf ? await this.app.getSavedPosition() : this.app.getDefaultPosition(this.getItemId());
            }
            if (newX < 0) { newX = 100; }
            this.setPosition(newX);
        } else {
            if (hasPosition || vpRezzedX >= 0) {
                if (this.getPosition() !== newX) {
                    this.move(newX);
                }
            }
        }

        if (isFirstPresence) {
            this.show(true, Config.get('room.fadeInSec', 0.3));
        }

        if (as.Bool(this.getProperties()[Pid.IframeAspect])) {
            if (as.Bool(this.getProperties()[Pid.IframeAuto])) {
                this.openFrame();
            }
        }

        if (as.String(this.getProperties()[Pid.IframeAutoRange]) !== '') {
            this.checkIframeAutoRange();
        }

        if (isFirstPresence) {
            this.sendItemEventToAllScriptFrames({ event: 'rez' });
        }

        if (isFirstPresence) {
            if (this.room?.iAmAlreadyHere()) {
                if (Config.get('roomItem.chatlogItemAppeared', true)) {
                    this.room?.showChatMessage(null, 'itemStatus', this.getDisplayName(), 'appeared');
                }
            } else {
                if (Config.get('roomItem.chatlogItemIsPresent', true)) {
                    this.room?.showChatMessage(null, 'itemStatus', this.getDisplayName(), 'is present');
                }
            }
        }
    }

    public async onPresenceUnavailable(stanza: any): Promise<void>
    {
        if (this.myItem) {
            this.app.decrementRezzedItems(this.getProperties()[Pid.Label] + ' ' + this.getProperties()[Pid.Id]);
        }

        if (as.Bool(this.getProperties()[Pid.IframeAspect])) {
            if (as.Bool(this.getProperties()[Pid.IframeLive])) {
                this.closeFrame();
            }
        }

        if (as.Bool(Config.get('roomItem.chatlogItemDisappeared'), true)) {
            this.room?.showChatMessage(null, 'itemStatus', this.getDisplayName(), 'disappeared');
        }

        this.sendItemEventToAllScriptFrames({ event: 'derez' });

        this.remove();
    }

    public onMouseEnterAvatar(ev: PointerEventData): void
    {
        super.onMouseEnterAvatar(ev);
        const delaySecs = Config.get('room.itemStatsTooltipDelay', 500) / 1000;
        this.showStatsDisplay(delaySecs);
    }

    public onMouseLeaveAvatar(ev: PointerEventData): void
    {
        super.onMouseLeaveAvatar(ev);

        // When mouse moves from own avatar to transparent area of an avatar above our avatar,
        // an onMouseEnterAvatar might follow immediately after handling this event.
        // So delay actual closing slightly:
        this.hideStatsDisplay(0.05);
    }

    public onUnmodifiedLeftClickAvatar(ev: PointerEventData): void
    {
        super.onUnmodifiedLeftClickAvatar(ev);
        if (as.Bool(this.properties[Pid.IframeAspect], false)) {
            this.handleUnmodifiedClickForIframeAspect();
        }
        this.hideStatsDisplay(0);
    }

    public onCtrlLeftClickAvatar(ev: PointerEventData): void
    {
        super.onCtrlLeftClickAvatar(ev);
        if (this.myItem) {
            this.app.derezItem(this.properties[Pid.Id]);
        }
        this.hideStatsDisplay(0);
    }

    onUnmodifiedLeftLongclickAvatar(ev: PointerEventData): void
    {
        super.onUnmodifiedLeftLongclickAvatar(ev);
        if (this.statsDisplay) {
            this.hideStatsDisplay(0);
        } else {
            this.showStatsDisplay(0);
        }
    }

    private handleUnmodifiedClickForIframeAspect(): void
    {
        const frameOpts = ItemProperties.getParsedIframeOptions(this.properties);
        const frame = frameOpts.frame ?? 'Window';
        let openFrame = false;
        if (frame === 'Popup') {
            if (this.framePopup) {
                if (frameOpts.closeIsHide) {
                    if (this.framePopup.getVisibility()) {
                        this.framePopup.setVisibility(false);
                    } else {
                        this.framePopup.setVisibility(true);
                    }
                } else {
                    const magicKey = Config.get(
                        'iframeApi.messageMagicRezactive',
                        'tr67rftghg_Rezactive');
                    const msg = { [magicKey]: true, type: 'Window.Close' };
                    this.getScriptWindow()?.postMessage(msg, '*');
                    window.setTimeout((): void =>
                    {
                        this.framePopup.close();
                    }, 100);
                }
            } else {
                openFrame = true;
            }
        } else {
            if (this.frameWindow) {
                if (this.frameWindow.isOpen()) {
                    this.frameWindow.setVisibility(true);
                    this.frameWindow.toFront();
                }
            } else {
                openFrame = true;
            }
        }
        if (openFrame) {
            this.openFrame();
        }
    }

    public onUnmodifiedLeftDoubleclickAvatar(ev: PointerEventData): void
    {
        super.onUnmodifiedLeftDoubleclickAvatar(ev);
        switch (ev.buttons) {
            case DomButtonId.first: {
                switch (ev.modifierKeys) {
                    case DomModifierKeyId.none: {
                        if (as.Bool(this.properties[Pid.IframeAspect])) {
                            if (this.framePopup) {
                                const visible = this.framePopup.getVisibility();
                                this.framePopup.setVisibility(!visible);
                            } else if (this.frameWindow) {
                                const visible = this.frameWindow.getVisibility();
                                this.frameWindow.setVisibility(!visible);
                            }
                        }
                    } break;
                }
            } break;
        }
    }

    public onDragAvatarStart(ev: PointerEventData): void
    {
        super.onDragAvatarStart(ev);
        this.statsDisplay?.close();

        if (this.framePopup) {
            const frameOpts = ItemProperties.getParsedIframeOptions(this.properties);
            if (frameOpts.closeIsHide) {
                // Intentionally keep open and visible.
            } else {
                this.framePopup.close();
            }
        }
    }

    public onDraggedTo(newX: number): void
    {
        if (!this.isDerezzing && this.getPosition() !== newX) {
            const itemId = this.getItemId();
            if (this.myItem) {
                this.app.moveRezzedItem(itemId, newX);
            } else {
                this.quickSlide(newX);
            }
        }
    }

    public isValidDropTargetForItem(draggingItem: RoomItem|BackpackItem): boolean
    {
        if (!as.Bool(this.getProperties()[Pid.ApplierAspect])) {
            return false; // This RoomItem doesn't support getting any items dropped on.
        }
        if (draggingItem instanceof RoomItem) {
            // RoomItem on Participant.
            if (draggingItem === this) {
                return false; // Not dropable onto itself.
            }
            if (!draggingItem.isMyItem() || !this.isMyItem()) {
                return false; // Actions involving other's RoomItem not supported yet.
            }
            return true; // Todo: More specific tests for item intaractability.
        } else if (draggingItem instanceof BackpackItem) {
            if (this.isMyItem()) {
                return false; // Own BackpackItem on own RoomItem not supported yet.
            } else {
                return false; // Own BackpackItem on other's RoomItem not supported yet.
            }
        }
        return false;
    }

    public onGotItemDroppedOn(droppedItem: RoomItem | BackpackItem): void
    {
        if (!this.isValidDropTargetForItem(droppedItem)) {
            return;
        }
        (async (): Promise<void> =>
        {
            if (droppedItem instanceof RoomItem) {
                // RoomItem on RoomItem.
                const result = await this.room.applyItemToItem(this, droppedItem);
                const effect = as.String(result[Pid.ShowEffect]);
                if (effect !== '') {
                    this.showEffect(effect);
                }
            } else if (droppedItem instanceof BackpackItem) {
                // BackpackItem on RoomItem.
                // Not yet
            }
        })().catch(error =>
        {
            this.app.onError(ErrorWithData.ofError(
                error, undefined, { this: this, droppedItem: droppedItem }));
        });
    }

    public async onMoveDestinationReached(newX: number): Promise<void>
    {
        super.onMoveDestinationReached(newX);

        const itemId = this.getItemId();
        if (this.myItem) {
            const props = await BackgroundMessage.getBackpackItemProperties(itemId);
            if (as.Bool(props[Pid.IframeLive])) {

                const itemData = {
                    id: itemId,
                    x: newX,
                    isOwn: this.myItem,
                    properties: this.properties,
                };

                this.sendMessageToScriptFrame(new WeblinClientIframeApi.ItemMovedNotification(itemData, newX));
            }
        }

        this.onMoved(newX);
    }

    protected onQuickSlideReached(newX: number): void
    {
        super.onQuickSlideReached(newX);

        this.onMoved(newX);
    }

    public onMoved(newX: number): void
    {
        if (as.String(this.getProperties()[Pid.IframeAutoRange]) !== '') {
            this.checkIframeAutoRange();
        }

        if (this.framePopup) {
            const frameOpts = ItemProperties.getParsedIframeOptions(this.properties);
            if (frameOpts.anchor !== 'Base') {
                this.framePopup.move();
            }
        }
    }

    public async applyItem(passiveItem: RoomItem): Promise<ItemProperties>
    {
        const itemId = this.getItemId();
        const passiveItemId = passiveItem.getItemId();

        if (this.framePopup) {
            this.getScriptWindow()?.postMessage({ [Config.get('iframeApi.messageMagicRezactive', 'tr67rftghg_Rezactive')]: true, type: 'Window.Close' }, '*');
            window.setTimeout(() => { this.framePopup.close(); }, 100);
        }

        if (!await BackgroundMessage.isBackpackItem(passiveItemId)) {
            const fact = ItemException.fact2String(ItemException.Fact.NotApplied);
            const reason = ItemException.reason2String(ItemException.Reason.NotYourItem);
            const detail = passiveItemId;
            new SimpleErrorToast(this.app, 'Warning-' + fact + '-' + reason, Config.get('room.applyItemErrorToastDurationSec', 5), 'warning', fact, reason, detail).show();
        } else {

            if (!this.myItem) {
                const fact = ItemException.fact2String(ItemException.Fact.NotApplied);
                const reason = ItemException.reason2String(ItemException.Reason.NotYourItem);
                const detail = passiveItemId;
                new SimpleErrorToast(this.app, 'Warning-' + fact + '-' + reason, Config.get('room.applyItemErrorToastDurationSec', 5), 'warning', fact, reason, detail).show();
            } else {
                try {
                    const result = await BackgroundMessage.applyItemToBackpackItem(itemId, passiveItemId);
                    if (Config.get('points.enabled', false)) {
                        BackgroundMessage.pointsActivity(Pid.PointsChannelItemApply, 1)
                            .catch(error => { log.info('Room.applyItem', error); });
                    }
                    return result;
                } catch (ex) {
                    // new SimpleErrorToast(this.app, 'Warning-' + error.fact + '-' + error.reason, Config.get('room.applyItemErrorToastDurationSec', 5), 'warning', error.fact, error.reason, error.detail).show();
                    const fact = ItemException.factFrom(ex.fact);
                    const reason = ItemException.reasonFrom(ex.reason);
                    const detail = ex.detail;
                    new SimpleErrorToast(this.app, 'Warning-' + fact + '-' + reason, Config.get('room.applyItemErrorToastDurationSec', 5), 'warning', ItemException.fact2String(fact), ItemException.reason2String(reason), detail).show();
                }
            }
        }

        return new ItemProperties();
    }

    private isDerezzing: boolean = false;
    public beginDerez(): void
    {
        this.isDerezzing = true;
        $(this.getElem()).hide().delay(1000).show(0);
    }

    public endDerez(): void
    {
        this.isDerezzing = false;
    }

    public sendMessageToScreenItemFrame(message: any): void
    {
        this.screenUnderlay?.sendMessage(message);
    }

    public async openDocumentUrl(aboveElem: HTMLElement): Promise<void>
    {
        let url = as.String(this.properties[Pid.DocumentUrl]);
        const room = this.app.getRoom();
        const userId = as.String(await Memory.getLocal(Utils.localStorageKey_Id(), ''));

        if (url !== '' && room && userId !== '') {
            const tokenOptions = {};
            if (this.myItem) {
                tokenOptions['properties'] = await BackgroundMessage.getBackpackItemProperties(this.getItemId());
            } else {
                tokenOptions['properties'] = this.properties;
            }
            const contextToken = await Payload.getContextToken(userId, this.getItemId(), this.app.getLanguage(), 600, { 'room': room.getJid() }, tokenOptions);
            url = url.replace('{context}', encodeURIComponent(contextToken));

            const documentOptions = JSON.parse(as.String(this.properties[Pid.DocumentOptions], '{}'));
            this.openIframeAsWindow(aboveElem, url, documentOptions);
        }
    }

    public checkIframeAutoRange(): void
    {
        const range = Utils.parseStringMap(as.String(this.getProperties()[Pid.IframeAutoRange]));
        this.showItemRange(true, range);
        const myParticipant = this.room.getMyParticipant();
        if (!is.nil(myParticipant) && this.isInRange(myParticipant, range)) {
            this.openFrame();
        } else {
            this.closeFrame();
        }
    }

    protected isInRange(participant: Participant, range: any): boolean
    {
        const x = participant.getPosition();

        const itemRect = this.elem.getBoundingClientRect();
        const absPos = Math.floor(itemRect.x + itemRect.width / 2);
        const absRangeLeft = absPos + as.Int(range['left']);
        const absRangeRight = absPos + as.Int(range['right']);

        const isInRange = x >= absRangeLeft && x <= absRangeRight;
        return isInRange;
    }

    private openFrame(): void
    {
        (async () =>
        {
            let iframeUrl = as.String(this.properties[Pid.IframeUrl]);
            const room = this.app.getRoom();
            const userId = as.String(await Memory.getLocal(Utils.localStorageKey_Id(), ''));
            const itemId = this.getItemId();
            if (iframeUrl === '' || !room || userId === '') {
                return;
            }
            //iframeUrl = 'https://jitsi.vulcan.weblin.com/{room}#userInfo.displayName="{name}"';
            //iframeUrl = 'https://jitsi.vulcan.weblin.com/8lgGTypkGd#userInfo.displayName="{name}"';
            //iframeUrl = 'https://meet.jit.si/example-103#interfaceConfig.TOOLBAR_BUTTONS=%5B%22microphone%22%2C%22camera%22%2C%22desktop%22%2C%22fullscreen%22%2C%22hangup%22%2C%22profile%22%2C%22settings%22%2C%22videoquality%22%5D&interfaceConfig.SETTINGS_SECTIONS=%5B%22devices%22%2C%22language%22%5D&interfaceConfig.TOOLBAR_ALWAYS_VISIBLE=false';
            //iframeUrl = 'https://webex.vulcan.weblin.com/Vidconf?room=weblin{room}&name={name}';
            //iframeUrl = 'https://video.weblin.io/Vidconf?room=weblin{room}&name={name}';

            const roomJid = room.getJid();

            const tokenOptions = {};
            if (as.String(this.properties[Pid.Provider], '') === 'n3q') {
                tokenOptions['properties'] = {
                    [Pid.Id]: itemId,
                    [Pid.Provider]: 'n3q',
                    [Pid.InventoryId]: this.properties[Pid.InventoryId],
                };
            } else {
                tokenOptions['properties'] = this.properties;
            }

            const contextToken = await Payload.getContextToken(userId, itemId, this.app.getLanguage(), 600, { 'room': roomJid }, tokenOptions);

            iframeUrl = iframeUrl
                .replace('{context}', encodeURIComponent(contextToken))
                .replace('{room}', encodeURIComponent(roomJid))
                ;

            const participant = this.room.getMyParticipant();
            if (participant) {
                const participantDisplayName = participant.getDisplayName();
                iframeUrl = iframeUrl.replace('{name}', encodeURIComponent(participantDisplayName));
            }

            iframeUrl = iframeUrl.replace(/"/g, '%22');

            const iframeOptions = ItemProperties.getParsedIframeOptions(this.properties);

            let anchorElem: HTMLElement;
            switch (as.String(iframeOptions.anchor, 'Entity')) {
                default:
                case 'Entity':
                    anchorElem = this.elem;
                    break;
                case 'Base':
                    anchorElem = this.app.getDisplay();
                    break;
            }
            switch (as.String(iframeOptions.frame, 'Window')) {
                case 'Popup':
                    this.openIframeAsPopup(anchorElem, iframeUrl, iframeOptions);
                    break;
                default:
                case 'Window':
                    this.openIframeAsWindow(anchorElem, iframeUrl, iframeOptions);
                    break;
            }

        })().catch(error =>
        {
            this.app.onError(ErrorWithData.ofError(error));
        });
    }

    closeFrame(): void
    {
        if (this.framePopup) {
            this.framePopup.close();
            this.framePopup = null;
        } else if (this.frameWindow) {
            this.frameWindow.close();
            this.frameWindow = null;
        }
    }

    setFrameVisibility(visible: boolean): void
    {
        (this.framePopup ?? this.frameWindow)?.setVisibility(visible);
    }

    setWindowStyle(style: string): void
    {
        const window = this.framePopup ?? this.frameWindow;
        const elem = window?.getWindowElem();
        if (!is.nil(elem)) {
            elem.style.cssText += style;
        }
    }

    protected openIframeAsPopup(anchorElem: HTMLElement, iframeUrl: string, popupOptions: any): void
    {
        if (this.elem && this.framePopup == null) {
            this.framePopup = new ItemFramePopup(this.app);

            const width = as.Int(popupOptions.width, 100);
            const options: ItemFramePopupOptions = {
                item: this,
                elem: anchorElem,
                url: iframeUrl,
                onClose: () => { this.framePopup = null; },
                hidden: as.Bool(popupOptions.hidden),
                width: width,
                height: as.Int(popupOptions.height, 100),
                left: as.Int(popupOptions.left, -width / 2),
                bottom: as.Int(popupOptions.bottom, 50),
                closeButton: as.Bool(popupOptions.closeButton, true),
                transparent: as.Bool(popupOptions.transparent, false),
                closeIsHide: as.Bool(popupOptions.closeIsHide, false),
            };

            this.framePopup.show(options);
        }
    }

    protected openIframeAsWindow(anchorElem: HTMLElement, iframeUrl: string, windowOptions: any): void
    {
        if (this.elem && this.frameWindow == null) {
            this.frameWindow = new ItemFrameWindow(this.app, this);

            const options: ItemFrameWindowOptions = {
                above: anchorElem,
                url: iframeUrl,
                onClose: () => { this.frameWindow = null; },
                width: as.Int(windowOptions.width, 100),
                height: as.Int(windowOptions.height, 100),
                left: windowOptions.left,
                bottom: as.Int(windowOptions.bottom, 50),
                resizable: as.Bool(windowOptions.rezizable, true),
                undockable: as.Bool(windowOptions.undockable),
                undocked: as.Bool(windowOptions.undocked),
                transparent: as.Bool(windowOptions.transparent),
                hidden: as.Bool(windowOptions.hidden),
                titleText: as.String(this.properties[Pid.Description], as.String(this.properties[Pid.Label], 'Item')),
            };

            this.frameWindow.show(options);
        }
    }

    public positionFrame(width: number, height: number, left: number, bottom: number, options: any = null): void
    {
        this.framePopup?.position(width, height, left, bottom, options);
        this.frameWindow?.position(width, height, left, bottom);
    }

    public toFrontFrame(guiLayer?: number|string): void
    {
        this.framePopup?.toFront(guiLayer);
        this.frameWindow?.toFront(guiLayer);
    }

    public async setItemProperty(pid: string, value: any): Promise<void>
    {
        if (await BackgroundMessage.isBackpackItem(this.getItemId())) {
            await BackgroundMessage.modifyBackpackItemProperties(this.getItemId(), { [pid]: value }, [], {});
        }
    }

    public async setItemState(state: string): Promise<void>
    {
        if (await BackgroundMessage.isBackpackItem(this.getItemId())) {
            await BackgroundMessage.modifyBackpackItemProperties(this.getItemId(), { [Pid.State]: state }, [], {});
        }
    }

    public setItemCondition(condition: string): void
    {
        this.avatarDisplay?.setCondition(condition);
    }

    public showItemRange(visible: boolean, range: any): void
    {
        if (visible) {
            this.setRange(range.left, range.right);
        } else {
            this.removeRange();
        }
    }

    protected sendItemEventToAllScriptFrames(data: any): void
    {
        const itemData = {
            id: this.getItemId(),
            x: this.getPosition(),
            isOwn: this.isMyItem(),
            properties: this.getProperties([Pid.Template, Pid.OwnerId]),
        };

        const itemIds = this.room.getAllScriptedItems();
        for (let i = 0; i < itemIds.length; i++) {
            this.room.getItemByItemId(itemIds[i])?.sendMessageToScriptFrame(new WeblinClientIframeApi.ItemEventNotification(itemData, data));
        }
    }

    protected sendItemPropertiesToAllScriptFrames(): void
    {
        const itemIds = this.room.getAllScriptedItems();
        for (let i = 0; i < itemIds.length; i++) {
            this.room.getItemByItemId(itemIds[i])?.sendMessageToScriptFrame(new WeblinClientIframeApi.ItemPropertiesChangedNotification(this.getItemId(), this.properties));
        }
    }

    public sendMessageToScriptFrame(message: any): void
    {
        message[Config.get('iframeApi.messageMagicRezactive', 'tr67rftghg_Rezactive')] = true;
        this.getScriptWindow()?.postMessage(message, '*');
    }

    private showStatsDisplay(delaySecs: number): void
    {
        window.clearTimeout(this.statsDisplayCloseTimeout);
        this.statsDisplayCloseTimeout = null;
        if (Utils.isBackpackEnabled() && !this.statsDisplay && is.nil(this.statsDisplayOpenTimeout)) {
            const action = () => {
                this.statsDisplay = new RoomItemStats(this.app, this, () => { this.statsDisplay = null; });
                this.statsDisplay.show();
            };
            this.statsDisplayOpenTimeout = window.setTimeout(action, 1000 * delaySecs);
        }
    }

    private hideStatsDisplay(delaySecs: number): void
    {
        window.clearTimeout(this.statsDisplayOpenTimeout);
        this.statsDisplayOpenTimeout = null;
        if (this.statsDisplay && (delaySecs === 0 || is.nil(this.statsDisplayCloseTimeout))) {
            const action = () => {
                this.statsDisplayCloseTimeout = null;
                this.statsDisplay?.close();
            };
            this.statsDisplayCloseTimeout = window.setTimeout(action, 1000 * delaySecs);
        }

    }

}
