interface IChange extends Array<string> { }
interface IChanges extends Array<IChange> { }
interface IRelease extends Array<string | IChanges> { 0: string; 1: string; 2: IChanges }
interface IHistory extends Array<IRelease> { }

export class _Changes
{
    static data: IHistory = [
        ['1.2.8', 'NextVersion', [
            ['Fix', 'Text of changes window not selectable'],
        ]],
        ['1.2.7', 'VidconfUndocked', [
            ['Change', 'Video windows initially undocked because Jitsi does not support embedding in iframes anymore'],
        ]],
        ['1.2.6', 'Tutorial', [
            ['Add', 'Tutorial videos'],
            ['Add', 'Tooltip to toast title'],
            ['Change', 'Show mouse hover over badges'],
        ]],
        ['1.2.5', 'PresenceFightShadowDom', [
            ['Add', 'Long click as hover alternative'],
            ['Add', 'Support for translated item properties'],
            ['Add', 'Support for tools (as badges)'],
            ['Change', 'Room item popup to adapt to content width'],
            ['Change', 'Points bar title hover to always show all channels'],
            ['Change', 'Backpack item popup spacing and item description'],
            ['Fix', 'Eternal lockout after setting a nickname containing code points deemed illegal by XMPP server'],
            ['Fix', 'Competing tabs'],
            ['Fix', 'JQuery-UI negatively interacts with CSS of some pages'],
            ['Fix', 'Miscellaneous UI glitches on touch devices'],
            ['Fix', 'Badge menu visible although items disabled'],
            ['Fix', 'Style collisions'],
        ]],
        ['1.2.4', 'AvatarMenu', [
            ['Add', 'Client sends active status to web site to allow for easy detection of an interactable client'],
            ['Add', 'Claimable activity points reminder'],
            ['Add', 'Support for 200x200 gallery avatars'],
            ['Add', 'Support for non-GIF gallery avatars'],
            ['Add', 'Restore chat bubbles from history on load'],
            ['Add', 'Multiple stacked chat bubbles'],
            ['Add', 'Avatar menu shows all actions/emotes available for the current avatar'],
            ['Add', 'Optionally stay in room while tab is inactive'],
            ['Change', 'Avatar menu actions/emotes list moved into a submenu'],
            ['Change', 'Extension button minimizes by hiding the display and shows activity while minimized'],
            ['Fix', 'Avatar menu always opens fully on screen and is never covered by other GUI elements'],
            ['Fix', 'On locations without destination, items are not rezzable'],
            ['Fix', 'Videoconf not working till next page reload after nickname change'],
            ['Fix', 'Inconsistent presence state for multiple tabs in same room triggering "random" walks and ghosting'],
        ]],
        ['1.2.3', 'ClickThroughBadgesPersistentChat', [
            ['Add', 'Persistent chat'],
            ['Add', 'Avatar generator link to settings'],
            ['Add', 'Hide invisible items from backpack and room/page'],
            ['Change', 'Modal toast larger'],
            ['Change', 'Random name generator blocklist'],
            ['Change', 'Blue icons'],
            ['Fix', 'Dragging now works with touch/pen input'],
            ['Fix', 'Links behind transparent areas of room items and avatars are now clickable'],
            ['Fix', 'Room items and avatars behind other room entities are now consistently dragable'],
            ['Fix', 'Room item and avatar hover glow now corresponds to actual interactivity'],
            ['Fix', 'Dragged items now never affect more than one drop target'],
            ['Fix', 'Dragging a room item owned by someone else over own backpack window now doesn\'t move the item'],
            ['Fix', 'Room item info now always opens in front of other all room items and avatars'],
            ['Fix', 'Fixed move animation not stopping on own avatar when switching tabs'],
        ]],
        ['1.2.2', 'AvatarApi', [
            ['Add', 'Avatar API'],
            ['Add', 'Language to item iframe context'],
            ['Add', 'Participant double click for chat-in field with @nickname'],
            ['Change', 'Ignore greet toast per user'],
            ['Change', 'Delay between points activity recording'],
            ['Change', 'Emote (greet) does not count as chat (emote) with respect to points activities'],
            ['Change', 'Reorder /room output'],
            ['Fix', 'Toast below item popups'],
            ['Fix', 'Input placeholder style'],
        ]],
        ['1.2.1', 'ServerItems1', [
            ['Add', 'Support for points migration to server based items'],
            ['Add', 'Prepare for social network points channel'],
            ['Change', 'Remove Source: Server notice'],
            ['Fix', 'Backpack item infos not closing when backpack window closes'],
            ['Fix', 'Don\'t show unknown reason error message'],
        ]],
        ['1.2.0', 'ServerItems', [
            ['Add', 'Server based items'],
            ['Add', 'CTRL-item-click drops/pickups item'],
            ['Add', 'CTRL-self-click toggles backpack window'],
            ['Add', 'Confirmation on item transfer'],
            ['Add', 'Create NFT avatar failure toast with toggle backpack link'],
            ['Add', 'Support page effects'],
            ['Add', 'Unique chat line id to be able to store a chat history later'],
            ['Add', 'Claim and auto-claim activity points'],
            ['Add', 'Iframe API Client.GetApi for extension detection'],
            ['Add', 'Wave animation feedback to greet and bye'],
            ['Add', 'Show item owner name on hover'],
            ['Add', 'Backpack scrollable'],
            ['Add', 'Windows resize in all directions'],
            ['Change', 'Style of dropped items in backpack'],
            ['Change', 'Warn of duplicate NFT avatar'],
            ['Change', 'Item popup above windows'],
            ['Change', 'Overlapping backpack item popup'],
        ]],
        ['1.1.4', 'VideoUrlFix', [
            ['Fix', 'Invalid vidconfUrl after extension start'],
        ]],
        ['1.1.3', 'OpenSource NftAvatar', [
            ['Add', 'Config i18n.overrideBrowserLanguage'],
            ['Add', 'Load web3 nft items for all web nft contract items'],
            ['Add', 'Support NFT extraction by CryptoWallet item'],
            ['Change', 'To BSL with immediate BSD0 exception for infinite-garden/non-silo projects'],
            ['Fix', 'Remove main #n3q div before adding another one for SPAs'],
            ['Fix', 'New ejabberd sends room presence w/o nick: ignore'],
        ]],
        ['1.1.2', 'Redesign', [
            ['Add', 'Limit and warning for items on page'],
            ['Add', 'XMPP version response'],
            ['Add', 'Time to chat log'],
            ['Add', 'Toggle private chat window on other participants avatar ctrl-dbl-click'],
            ['Add', 'A disposable marker to indicate which one is your avatar'],
            ['Add', 'Show current points channels as tooltip'],
            ['Change', 'Design to borderless/shadow'],
            ['Change', 'Pulse effect in front'],
            ['Fix', 'Animation remains even though AnimationsUrl property removed from item'],
            ['Fix', 'Presence error on presence w/o muc/join child after long downtime where room kicks user and demands explicit re-enter'],
            ['Fix', 'Unable to re-join private video conference'],
        ]],
        ['1.1.1', 'Crafting', [
            ['Add', 'Crafting'],
            ['Add', 'Iframe API library'],
            ['Add', 'Toast when receiving an item'],
            ['Add', 'Popup can adjust height automatically'],
            ['Add', 'Some features for Frank to the iframe API'],
            ['Add', 'Page API'],
            ['Change', 'Default item to quite transparent pyramid to remove visible space used'],
            ['Change', 'Disable items for embedded'],
            ['Fix', 'Item state is not visible remotely'],
            ['Fix', 'Claim certificate not visible remotely'],
            ['Fix', 'Not all signed item properties are sent thru presence, which fails the sig'],
            ['Fix', 'Animated items start animations w/ a hickup'],
            ['Fix', 'Unclosed DIV in chat line'],
        ]],
        ['1.1.0', 'Benji', [
            ['Add', 'Scripting to iframe API & Autorez (Benji, Meerkat)'],
            ['Add', 'Inactive mode (xmpp: presence-show away) and multi-tab presence-show management'],
            ['Add', 'Chat window clear button'],
            ['Add', 'Chat sound controlled by checkbox in chat window (other participants only)'],
            ['Add', 'Initial items'],
            ['Add', 'Effect for miner'],
            ['Change', 'Stay on page if item dropped (which makes Benji a bit unwilling to follow when switching tabs)'],
            ['Change', 'Removed stay-on-tab-change menu entry (there are enough ways to stay)'],
            ['Change', 'Quick slide items without defined avatar speed'],
            ['Change', 'Nickname excluded from copy all text (not selectable)'],
            ['Change', 'Migrate id/nickname/avatar from sync to local storage'],
            ['Change', 'Configure log channels for release version'],
            ['Fix', 'Avatar position resets when dragged while already moving'],
            ['Fix', 'Leave room on any leave from several tabs with the same room'],
            ['Fix', 'Avatars and items flicker when other users navigate'],
        ]],
        ['1.0.9', 'WeblinMigration Web3 RezButton', [
            ['Add', 'transparent iframe'],
            ['Add', 'Document window'],
            ['Add', 'Rez item by button'],
            ['Add', 'Weblin migration'],
            ['Add', 'Label to backpack item'],
            ['Add', 'Web3 based items'],
            ['Add', 'Drop button to backpack item info'],
            ['Add', 'Menu option: send goodbye'],
            ['Change', 'Click through transparent images'],
            ['Change', 'Spawn new item in backpack to free space'],
            ['Fix', 'Accidental backpack item info after drop/pickup from backpack'],
            ['Fix', 'Created items disappear on next presence'],
        ]],
        ['1.0.8', 'Points PrivVidConf Screen Stats', [
            ['Add', 'Greet back'],
            ['Add', 'Chat console opens windows'],
            ['Add', 'Save window state'],
            ['Add', 'Private videoconference'],
            ['Add', 'Activity points'],
            ['Add', 'Item info/stats'],
            ['Add', 'Item shredder'],
            ['Add', 'Chat console /map'],
            ['Add', 'Autostart public viewing on item drop'],
            ['Add', 'Screen item & inter-frame comm'],
        ]],
        ['1.0.7', 'unsafe-eval', [
            ['Add', 'Have items'],
            ['Add', 'Manage page claims'],
            ['Add', 'Detectable for embedded'],
            ['Change', 'Skip call to item config'],
            ['Fix', 'Remove unneccesary unsafe-eval from content_security_policy (for MS Edge Addons Store)'],
        ]],
        ['1.0.6', 'PrivateChat Greet RecvDependentItems', [
            ['Add', 'Allow vidconf fullscreen'],
            ['Add', 'Private chat'],
            ['Add', 'Greet'],
            ['Add', 'Show user dependent items'],
            ['Add', 'Persist stay-on-tab-change flag'],
            ['Add', 'Persist open backpack'],
            ['Add', 'Undock vidconf window'],
            ['Add', 'vpi ignore (e.g. all google)'],
            ['Change', 'RallySpeaker URL variables, iframe allows 4 vidconf'],
            ['Change', 'Much longer chat bubble duration, 2 min. total instead of 20 sec.'],
            ['Change', 'Update to item inventory grain and chat room based inventory view (internal).'],
            ['Fix', 'Chat window focused input style'],
            ['Fix', 'Message replication by tab change'],
        ]],
        ['1.0.5', 'SPA', [
            ['Add', 'Stay in the room if vidconf|inventory|chat are open'],
            ['Change', 'Use new prod cluster'],
            ['Change', 'Preload only idle, move animations'],
            ['Fix', 'No avatar in sleep state without sleep animation'],
            ['Fix', 'Navigate on single page applications (check URL continuously)'],
        ]],
        ['1.0.4', 'Vidconf', [
            ['Add', 'Videoconf demo'],
            ['Add', 'Support for animationsUrl in presence-x-vp:props'],
            ['Add', 'Clickable chat links'],
            ['Add', 'XMPP vCard on hover'],
            ['Add', 'Avatar and item stacking order'],
            ['Change', 'Prefer presence-x-vp:props attributes over identity'],
            ['Change', 'Settings title to brand name (lowercase)'],
            ['Change', 'Variable avatar size'],
            ['Fix', 'Window position on small screens'],
            ['Fix', 'Url mapping (JS undefined)'],
        ]],
        ['1.0.3', 'XmppWindow SettingsDialog', [
            ['Add', 'Change history'],
            ['Add', 'Xmpp console window'],
            ['Add', 'Chat console'],
            ['Add', 'In-screen settings dialog + menu entry'],
            ['Add', 'Support for imageUrl in presence-x-vp:props'],
            ['Add', 'Computed identity digest to presence-x-firebat:...'],
            ['Fix', 'Duplicate presence-x-history'],
            ['Fix', 'Avatar position in presence may be float value instead of int'],
        ]],
        ['1.0.2', 'StoreFix', [
            ['Change', 'VPI query http request to https'],
            ['Add', 'VPI resolver'],
        ]],
        ['1.0.1', 'BackgoundDispatcher', [
            ['Change', 'Backgound room/tab dispatcher'],
        ]],
        ['1.0.0', 'MVP', [
            ['Add', 'Basic function'],
        ]],
    ];
}
