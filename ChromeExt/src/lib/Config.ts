import log = require('loglevel');
import { is } from './is';

// tslint:disable: quotemark

export class Config
{
    public static devConfigName = 'dev';
    private static devConfig: { [p: string]: unknown } = {};

    public static onlineConfigName = 'online';
    private static onlineConfig: { [p: string]: unknown } = {};

    public static staticConfigName = 'static';
    private static staticConfig: { [p: string]: unknown } = {
        environment: {
            // NODE_ENV: 'production', // 'development'
            reloadPageOnPanic: false,
        },
        extension: {
            id: 'cgfkfhdinajjhfeghebnljbanpcjdlkm',
            storeUrl: 'https://chrome.google.com/webstore/detail/weblin/cgfkfhdinajjhfeghebnljbanpcjdlkm',
        },
        me: {
            nickname: '',//'新しいアバター',//'new-avatar',
            avatar: '',
            active: '',
        },
        config: {
            serviceUrl: 'https://webex.vulcan.weblin.com/Config',
            apiUrl: 'https://webit.vulcan.weblin.com/rpc',
            updateIntervalSec: 83567,
            checkUpdateIntervalSec: 123,
            clusterName: 'prod',
        },
        test: {
            itemServiceRpcUrl: 'http://localhost:5000/rpc',
        },
        system: {
            activateBackgroundPageProbeDelayMinSec: 0.1,
            activateBackgroundPageProbeDelayMaxSec: 8,
            activateBackgroundPageProbeDelayFactor: 2,
            activateBackgroundPageProbeTotalSec: 120,
        },
        log: {
            all: false,
            startup: false,
            backgroundTraffic: false,
            backgroundPresenceManagement: false,
            room2tab: false,
            contentTraffic: false,
            rpcClient: false,
            backgroundFetchUrl: false,
            backgroundFetchUrlCache: false,
            HostedInventoryItemProviderItemCache: false,
            backgroundJsonRpc: false,
            pingBackground: false,
            contentStart: false,
            backpackWindow: false,
            urlMapping: false,
            web3: false,
            iframeApi: false,
            items: false,
            SimpleItemTransfer: false,
            pointerEventHandlingIncommingPointer: false, // pointermove omitted when pointerEventHandlingWithMove = false.
            pointerEventHandlingIncommingMouse: false, // pointermove omitted when pointerEventHandlingWithMove = false.
            pointerEventHandlingButtons: false,
            pointerEventHandlingDrag: false, // dragmove omitted when pointerEventHandlingWithMove = false.
            pointerEventHandlingHover: false, // hovermove omitted when pointerEventHandlingWithMove = false.
            pointerEventHandlingWithMove: false, // Includes corresponding move events for drag and hover.
        },
        client: {
            name: 'weblin.io',
            notificationToastDurationSec: 30,
            showIntroYou: 10,
        },
        settings: {
            nameGeneratorBlocklistRetries: 30,
            nameGeneratorBlocklist: ['black', 'bronze', 'brown', 'chocolate', 'coffee', 'maroon', 'white', 'yellow'],
        },
        design: {
            name: 'basic',
            version: ''
        },
        vp: {
            deferPageEnterSec: 0.3,
            vpiRoot: 'https://webex.vulcan.weblin.com/vpi/v7/root.xml',
            vpiMaxIterations: 15,
            ignoredDomainSuffixes: ['vulcan.weblin.com', 'meet.jit.si'],
            strippedUrlPrefixes: ['https://cdn.weblin.io/?', 'https://cdn.weblin.io/'],
            notStrippedUrlPrefixes: ['https://cdn.weblin.io/v1/', 'https://cdn.weblin.io/sso/'],
        },
        httpCache: {
            maxAgeSec: 3600,
            maintenanceIntervalSec: 60,
        },
        itemCache: {
            deferReplayPresenceSec: 0.3,
            clusterItemFetchSec: 0.1,
            maxAgeSec: 600,
            maintenanceIntervalSec: 30,
        },
        chatHistory: {
            publicMaxAgeSec: 3 * 24 * 3600,
            privateMaxAgeSec: 3 * 24 * 3600,
        },
        room: {
            fadeInSec: 0.3,
            quickSlideSec: 0.1,
            checkPageUrlSec: 3.0,
            defaultAvatarSpeedPixelPerSec: 100,
            randomEnterPosXMin: 300,
            randomEnterPosXMax: 600,
            showNicknameTooltip: true,
            chatBuubleFadeStartSec: 60.0,
            chatBuubleFadeDurationSec: 60.0,
            maxChatAgeSec: 60,
            chatWindowWidth: 400,
            chatWindowHeight: 250,
            chatWindowMaxHeight: 800,
            keepAliveSec: 120,
            chatlogEnteredTheRoom: true,
            chatlogEnteredTheRoomSelf: false,
            chatlogWasAlreadyThere: false,
            chatlogLeftTheRoom: true,
            nicknameOnHover: true,
            pointsOnHover: true,
            defaultStillimageSize: 80,
            defaultAnimationSize: 100,
            vCardAvatarFallback: false,
            vCardAvatarFallbackOnHover: true,
            vidconfUrl: 'https://webex.vulcan.weblin.com/Vidconf?room=weblin{room}&name={name}',
            vidconfBottom: 200,
            vidconfWidth: 630,
            vidconfHeight: 530,
            vidconfPopout: true,
            pokeToastDurationSec: 10,
            pokeToastDurationSec_bye: 60,
            privateVidconfToastDurationSec: 60,
            privateChatToastDurationSec: 60,
            errorToastDurationSec: 8,
            applyItemErrorToastDurationSec: 5,
            claimToastDurationSec: 15,
            itemStatsTooltip: true,
            itemStatsTooltipDelay: 500,
            itemStatsTooltipOffset: { x: 3, y: 3 },
            showPrivateChatInfoButton: false,
            autoOpenVidConfDomains: [],
        },
        xmpp: {
            service: 'wss://xmpp.vulcan.weblin.com/xmpp-websocket',
            domain: 'xmpp.vulcan.weblin.com',
            maxMucEnterRetries: 4,
            pingBackgroundToKeepConnectionAliveSec: 12,
            deferUnavailableSec: 3.0,
            deferAwaySec: 0.2,
            resendPresenceAfterResourceChangeBecauseServerSendsOldPresenceDataWithNewResourceToForceNewDataDelaySec: 1.0,
            versionQueryShareOs: true,
            verboseVersionQuery: false,
            sendVerboseVersionQueryResponse: true,
            verboseVersionQueryWeakAuth: 'K4QfJptO750u',
        },
        avatars: {
            animationsProxyUrlTemplate: 'https://webex.vulcan.weblin.com/Avatar/InlineData?url={url}',
            dataUrlProxyUrlTemplate: 'https://webex.vulcan.weblin.com/Avatar/DataUrl?url={url}',

            // animationsUrlTemplate: 'https://webex.vulcan.weblin.com/avatars/gif/{id}/config.xml',
            animationsUrlTemplate: 'https://webex.vulcan.weblin.com/avatars/{id}/config.xml',

            // list: ['gif/002/sportive03_m', 'gif/002/business03_m', 'gif/002/child02_m', 'gif/002/sportive01_m', 'gif/002/business06_m', 'gif/002/casual04_f', 'gif/002/business01_f', 'gif/002/casual30_m', 'gif/002/sportive03_f', 'gif/002/casual16_m', 'gif/002/casual10_f', 'gif/002/business03_f', 'gif/002/casual03_m', 'gif/002/sportive07_m', 'gif/002/casual13_f', 'gif/002/casual09_m', 'gif/002/casual16_f', 'gif/002/child02_f', 'gif/002/sportive08_m', 'gif/002/casual15_m', 'gif/002/casual15_f', 'gif/002/casual01_f', 'gif/002/casual11_f', 'gif/002/sportive09_m', 'gif/002/casual20_f', 'gif/002/sportive02_f', 'gif/002/business05_m', 'gif/002/casual06_m', 'gif/002/casual10_m', 'gif/002/casual02_f',],
            // randomList: ['gif/002/sportive03_m', 'gif/002/business03_m', 'gif/002/child02_m', 'gif/002/sportive01_m', 'gif/002/business06_m', 'gif/002/casual04_f', 'gif/002/business01_f', 'gif/002/casual30_m', 'gif/002/sportive03_f', 'gif/002/casual16_m', 'gif/002/casual10_f', 'gif/002/business03_f', 'gif/002/casual03_m', 'gif/002/sportive07_m', 'gif/002/casual13_f', 'gif/002/casual09_m', 'gif/002/casual16_f', 'gif/002/child02_f', 'gif/002/sportive08_m', 'gif/002/casual15_m', 'gif/002/casual15_f', 'gif/002/casual01_f', 'gif/002/casual11_f', 'gif/002/sportive09_m', 'gif/002/casual20_f', 'gif/002/sportive02_f', 'gif/002/business05_m', 'gif/002/casual06_m', 'gif/002/casual10_m', 'gif/002/casual02_f',],
            list: ['002/sportive03_m', '002/business03_m', '002/child02_m', '002/sportive01_m', '002/business06_m', '002/casual04_f', '002/business01_f', '002/casual30_m', '002/sportive03_f', '002/casual16_m', '002/casual10_f', '002/business03_f', '002/casual03_m', '002/sportive07_m', '002/casual13_f', '002/casual09_m', '002/casual16_f', '002/child02_f', '002/sportive08_m', '002/casual15_m', '002/casual15_f', '002/casual01_f', '002/casual11_f', '002/sportive09_m', '002/casual20_f', '002/sportive02_f', '002/business05_m', '002/casual06_m', '002/casual10_m', '002/casual02_f',],
            randomList: ['002/sportive03_m', '002/business03_m', '002/child02_m', '002/sportive01_m', '002/business06_m', '002/casual04_f', '002/business01_f', '002/casual30_m', '002/sportive03_f', '002/casual16_m', '002/casual10_f', '002/business03_f', '002/casual03_m', '002/sportive07_m', '002/casual13_f', '002/casual09_m', '002/casual16_f', '002/child02_f', '002/sportive08_m', '002/casual15_m', '002/casual15_f', '002/casual01_f', '002/casual11_f', '002/sportive09_m', '002/casual20_f', '002/sportive02_f', '002/business05_m', '002/casual06_m', '002/casual10_m', '002/casual02_f',],

            pointerOpaqueOpacityMin: 0.1,
            pointerDoubleclickMaxSec: 0.25,
            pointerDragStartDistance: 3.0,
            pointerDropTargetUpdateIntervalSec: 0.5,

            inactiveDecorationsHideDelaySec: 0.3,
        },
        identity: {
            url: '',
            digest: '',
            identificatorUrlTemplate: 'https://webex.vulcan.weblin.com/Identity/Generated?avatarUrl={avatarUrl}&nickname={nickname}&digest={digest}&imageUrl={imageUrl}&points={points}',
        },
        roomItem: {
            statsPopupOffset: 10,
            frameUndockedLeft: 100,
            frameUndockedTop: 100,
            chatlogItemAppeared: false,
            chatlogItemIsPresent: false,
            chatlogItemDisappeared: false,
            maxPageEffectDurationSec: 100.0,
        },
        iframeApi: {
            messageMagic: 'a67igu67puz_iframeApi',
            messageMagicPage: 'x7ft76zst7g_pageApi',
            messageMagic2Page: 'df7d86ozgh76_2pageApi',
            messageMagicRezactive: 'tr67rftghg_Rezactive',
            messageMagic2Screen: 'uzv65b76t_weblin2screen',
            messageMagicW2WMigration: 'hbv67u5rf_w2wMigrate',
            messageMagicCreateCryptoWallet: 'tr67rftghg_CreateCryptoWallet',
            allowedDomQueryPrefixes: ['https://opensea.io/', 'https://testnets.opensea.io/'],
            w2WMigrationProvider: 'n3q',
            w2WMigrationAuth: 'JVxIJIdR9ueq7sJwwPmM',
            createCryptoWalletProvider: 'n3q',
            avatarCreatedToastDurationSec: 8,
            avatarCreateToastDurationSec: 30,
        },
        backpack: {
            enabled: true,
            embeddedEnabled: false,
            itemSize: 64,
            borderPadding: 4,
            dropZoneHeight: 100,
            itemBorderWidth: 2,
            itemLabelHeight: 16,
            itemInfoOffset: { x: 2, y: 2 },
            itemInfoExtended: false,
            itemInfoDelay: 300,
            deleteToastDurationSec: 100,
            dependentPresenceItemsLimit: 25,
            dependentPresenceItemsWarning: 20,
            dependentPresenceItemsWarningIntervalSec: 30,
            loadWeb3Items: true,
            signaturePublicKey: '-----BEGIN PUBLIC KEY-----\n' +
                'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAL8cd14UE+Fy2QV6rtvbBA3UGo8TllmX\n' +
                'hcFcpuzkK2SpAbbNgA7IilojcAXsFsDFdCTTTWfofAEZvbGqSAQ0VJ8CAwEAAQ==\n' +
                '-----END PUBLIC KEY-----\n',
        },
        SimpleItemTransfer: {
            enabled: true,
            errorToastDurationSec: 8,
            senderConfirmToastDurationSec: 60,
            recipientAcceptToastDurationSec: 60,
            senderOfferWaitToastExtraDurationSec: 3,
            recipientConfirmMsgTimeoutSec: 30,
            senderSentCompleteToastDurationSec: 8,
            recipientRetrieveCompleteToastDurationSec: 8,
        },
        points: {
            enabled: true,
            passiveEnabled: true,
            submissionIntervalSec: 60,
            fullLevels: 2,
            fractionalLevels: 1,
            activityDisplayEnabled: false,
            delays: {
                PointsChannelChat: 5.0,
                PointsChannelEmote: 5.0,
                PointsChannelGreet: 5.0,
                PointsChannelNavigation: 10.0,
                PointsChannelPowerup: 10.0,
                PointsChannelItemApply: 2.0,
                PointsChannelPageOwned: 3.0,
                PointsChannelSocial: 3.0,
            },
            activities: {
                PointsChannelChat: { weight: 1, x0: 0, css: { backgroundColor: '#ff0000' } },
                PointsChannelEmote: { weight: 1, x0: 0, css: { backgroundColor: '#00ff00' } },
                PointsChannelGreet: { weight: 1, x0: 0, css: { backgroundColor: '#0000ff' } },
                PointsChannelNavigation: { weight: 1, x0: 0, css: { backgroundColor: '#ff00ff' } },
                PointsChannelPowerup: { weight: 1, x0: 0, css: { backgroundColor: '#ff00ff' } },
                PointsChannelItemApply: { weight: 1, x0: 0, css: { backgroundColor: '#00ffff' } },
                PointsChannelPageOwned: { weight: 1, x0: 0, css: { backgroundColor: '#ff8080' } },
                PointsChannelSocial: { weight: 1, x0: 0, css: { backgroundColor: '#8080ff' } },
            }
        },
        items: {
            'enabledProviders': ['n3q']
        },
        itemProviders: {
            'nine3q':
            {
                name: 'weblin.io Items (client storage)',
                type: 'LocalStorageItemProvider',
                description: 'Things on web pages managed by the client in a distributed fashion',
                config: {
                    backpackApiUrl: 'https://webit.vulcan.weblin.com/backpack',
                },
            },
            'n3q':
            {
                name: 'weblin.io Items',
                type: 'HostedInventoryItemProvider',
                description: 'Things on web pages',
                configUrl: 'https://webit.vulcan.weblin.com/Config?user={user}&token={token}&client={client}',
                config: {
                    itemApiUrl: 'https://webit.vulcan.weblin.com/ItemApi',
                    createItemWiCryptoClaimAuth: 'YrQGnYAfnqAJwfU8Im6C',
                },
            }
        },
        web3: {
            provider: {
                ETH: 'https://eth-mainnet.alchemyapi.io/v2/0_7o5JNttyfeUapKv8oI58Nslg5cwkDh',
                rinkeby: 'https://eth-rinkeby.alchemyapi.io/v2/r2gUsunv9dqoULzKRpZsIwo2MgOIYkO9',
            },
            weblinItemContractAddess: {
                ETH: '0x5792558410B253b96025f5C9dC412c4EDe5b5671',
                rinkeby: '0xed3efa74b416566c9716280e05bebee04f3fbf47',
            },
            weblinItemContractAbi: [
                {
                    "name": "balanceOf",
                    "constant": true,
                    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
                    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "payable": false,
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "name": "tokenOfOwnerByIndex",
                    "constant": true,
                    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }, { "internalType": "uint256", "name": "index", "type": "uint256" }],
                    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "payable": false,
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "name": "tokenURI",
                    "constant": true,
                    "inputs": [{ "internalType": "uint256", "name": "_tokenId", "type": "uint256" }],
                    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
                    "payable": false,
                    "stateMutability": "view",
                    "type": "function"
                },
            ],
            minimumItemableContractAbi: [
                {
                    "name": "balanceOf",
                    "constant": true,
                    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
                    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "payable": false,
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "name": "tokenOfOwnerByIndex",
                    "constant": true,
                    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }, { "internalType": "uint256", "name": "index", "type": "uint256" }],
                    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "payable": false,
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "name": "tokenURI",
                    "constant": true,
                    "inputs": [{ "internalType": "uint256", "name": "_tokenId", "type": "uint256" }],
                    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
                    "payable": false,
                    "stateMutability": "view",
                    "type": "function"
                },
            ],
        },
        i18n: {
            // overrideBrowserLanguage: 'fr-FR',
            defaultLanguage: 'en-US',
            languageMapping: {
                'de': 'de-DE',
            },
            translations: {
                'en-US': {
                    'Extension.Disable': 'Disable weblin.io',
                    'Extension.Enable': 'Enable weblin.io',

                    'StatusMessage.TabInvisible': 'Browser tab inactive',

                    'Common.Close': 'Close',
                    'Common.Undock': 'Open in separate window',

                    'Intro.Got it': 'Got it',
                    'Intro.You': 'You',

                    'Chatin.Enter chat here...': 'Enter chat here...',
                    'Chatin.SendChat': 'Send chat',

                    'Popup.title': 'Your weblin',
                    'Popup.description': 'Change name and avatar, then press [save].',
                    'Popup.Name': 'Name',
                    'Popup.Random': 'Random',
                    'Popup.Avatar': 'Avatar',
                    'Popup.Save': 'Save',
                    'Popup.Saving': 'Saving',
                    'Popup.Saved': 'Saved',
                    'Popup.Show avatar': 'Show avatar on pages',
                    'Popup.Uncheck to hide': 'Uncheck to hide avatar on pages',

                    'Menu.Menu': 'Menu',
                    'Menu.Settings': 'Settings',
                    'Menu.Stay Here': 'Stay on tab change',
                    'Menu.Backpack': 'Backpack',
                    'Menu.Chat Window': 'Chat History',
                    'Menu.Video Conference': 'Video Conference',
                    'Menu.Chat': 'Chat',
                    'Menu.Actions:': 'Actions:',
                    'Menu.wave': 'Wave',
                    'Menu.dance': 'Dance',
                    'Menu.cheer': 'Cheer',
                    'Menu.kiss': 'Kiss',
                    'Menu.clap': 'Clap',
                    'Menu.laugh': 'Laugh',
                    'Menu.angry': 'Angry',
                    'Menu.deny': 'Deny',
                    'Menu.yawn': 'Yawn',
                    'Menu.Greet': 'Greet',
                    'Menu.Bye': 'Wave Goodbye',
                    'Menu.Private Chat': 'Private Chat',
                    'Menu.Private Videoconf': 'Private Videoconference',
                    'Menu.Get weblin everywhere': 'Weblin für überall',

                    'Chatwindow.Chat History': 'Chat',
                    'Chatwindow.entered the room': '**entered the room**',
                    'Chatwindow.was already there': '**was already there**',
                    'Chatwindow.left the room': '**left the room**',
                    'Chatwindow.appeared': '*appeared*',
                    'Chatwindow.is present': '*is present*',
                    'Chatwindow.disappeared': '*disappeared*',
                    'Chatwindow.:': ':',
                    'Chatwindow.Toast.warning': '*Warning',
                    'Chatwindow.Toast.notice': '*Notice',
                    'Chatwindow.Toast.question': '*Question',
                    'Chatwindow.Clear': 'Empty',
                    'Chatwindow.Enable Sound': 'Enable sound',
                    'Chatwindow.Sound': 'Sound',

                    'PrivateChat.Private Chat with': 'Private Chat with',

                    'PrivateVidconf.Private Videoconference with': 'PrivateVidconf.Private Videoconference with',

                    'Vidconfwindow.Video Conference': 'Video Conference',
                    'Settingswindow.Settings': 'Settings',
                    'BackpackWindow.Inventory': 'Your Backpack',

                    // 'Backpack.Shredder': 'Shredder',
                    'Backpack.Go to item': 'Go there',
                    'Backpack.Derez item': 'Pick up',
                    'Backpack.Rez item': 'Drop',
                    'Backpack.Delete item': 'Delete',
                    'Backpack.Active': 'Active',
                    'Backpack.Too many items': 'Too many items',
                    'Backpack.You are close to the limit of items on a page.': 'You are close to the limit of items on a page. All items will be hidden if the number rises above the limit.',
                    'Backpack.Page items disabled.': 'Page items have been disabled. Collect items from the backpack to show them again.',

                    'SimpleItemTransfer.senderConfirmQuestionTitle': 'Send Item',
                    'SimpleItemTransfer.senderConfirmQuestionText': 'Do you want to send {item} to {recipient}?',
                    'SimpleItemTransfer.senderConfirmQuestionYes': 'Yes, offer item',
                    'SimpleItemTransfer.senderConfirmQuestionNo': 'No, keep it',
                    'SimpleItemTransfer.senderOfferWaitTitle': 'Send Item',
                    'SimpleItemTransfer.senderOfferWaitText': 'Offering {item} to {recipient}...',
                    'SimpleItemTransfer.senderOfferWaitCancel': 'Cancel and keep item',
                    'SimpleItemTransfer.recipientAcceptQuestionTitle': 'Receive Item',
                    'SimpleItemTransfer.recipientAcceptQuestionText':
                        '{sender} wants to send you an item.\n' +
                        'Item: {item}\n' +
                        'Do you accept the item?',
                    'SimpleItemTransfer.recipientAcceptQuestionYes': 'Yes, accept item',
                    'SimpleItemTransfer.recipientAcceptQuestionNo': 'No, reject it',
                    'SimpleItemTransfer.senderSenderTimeoutTitle': 'Item Not Sent',
                    'SimpleItemTransfer.senderSenderTimeoutText':
                        '{recipient} did not accept the item in time.\n' +
                        'You keep {item}.',
                    'SimpleItemTransfer.senderSenderCanceledTitle': 'Item Not Sent',
                    'SimpleItemTransfer.senderSenderCanceledText':
                        'You revoked the offer to {recipient}.\n' +
                        'You keep {item}.',
                    'SimpleItemTransfer.senderRecipientTimeoutTitle': 'Item Not Sent',
                    'SimpleItemTransfer.senderRecipientTimeoutText':
                        '{recipient} did not accept the item in time.\n' +
                        'You keep {item}.',
                    'SimpleItemTransfer.senderRecipientRejectedTitle': 'Item Not Sent',
                    'SimpleItemTransfer.senderRecipientRejectedText':
                        '{recipient} rejected the item.\n' +
                        'You keep {item}.',
                    'SimpleItemTransfer.senderSentCompleteTitle': 'Item Sent',
                    'SimpleItemTransfer.senderSentCompleteText': 'You sent {item} to {recipient}.',
                    'SimpleItemTransfer.recipientConfirmTimeoutTitle': 'Item Not Received',
                    'SimpleItemTransfer.recipientConfirmTimeoutText': '{item} from {sender} did not arrive in time.',
                    'SimpleItemTransfer.recipientCanceledTitle': 'Item Not Received',
                    'SimpleItemTransfer.recipientCanceledText': '{sender} revoked the offer of {item}.',
                    'SimpleItemTransfer.recipientRetrieveCompleteTitle': 'Item Received',
                    'SimpleItemTransfer.recipientRetrieveCompleteText': 'Received {item} from {sender}.',

                    'iframeApi.avatarCreateTitle': 'Accept Avatar',
                    'iframeApi.avatarActivateTitle': 'Activate Avatar',
                    'iframeApi.avatarCreateActivateTitle': 'Accept and Activate Avatar',
                    'iframeApi.avatarCreateText': 'Accept avatar {item}?',
                    'iframeApi.avatarActivateText': 'Activate avatar {item}?',
                    'iframeApi.avatarCreateActivateText': 'Accept and activate avatar {item}?',
                    'iframeApi.avatarCreateBtn': 'Accept',
                    'iframeApi.avatarActivateBtn': 'Activate',
                    'iframeApi.avatarCreateActivateBtn': 'Accept and activate',
                    'iframeApi.avatarCreateActivateCancelBtn': 'No, do nothing',
                    'iframeApi.avatarCreatedTitle': 'Avatar Received',
                    'iframeApi.avatarActivatedTitle': 'Avatar Activated',
                    'iframeApi.avatarCreatedActivatedTitle': 'Avatar Received and Activated',
                    
                    'Toast.Do not show this message again': 'Do not show this message again',
                    'Toast.greets': '...greeted you',
                    'Toast.byes': '...sent a goodbye',
                    'Toast.tousles': '...tousled you',
                    'Toast.nudges': '...nudged you',
                    'Toast.Your claim has been removed': 'Your claim has been removed',
                    'Toast.A stronger A stronger item just appeared': 'A stronger item just appeared.',
                    'Toast.greet back': 'Greet back',
                    'Toast.bye back': 'Send a goodbye back',
                    'Toast.tousle back': 'Tousle back',
                    'Toast.nudge back': 'Nudge back',
                    'Toast.Really delete?': 'Really delete?',
                    'Toast.Yes, delete item': 'Yes, delete item',
                    'Toast.No, keep it': 'No, keep it',
                    'Toast.Wants to start a private videoconference': 'Invites you to a private videoconference',
                    'Toast.Refuses to join the private videoconference': 'Refuses to join the videoconference',
                    'Toast.Accept': 'Accept',
                    'Toast.Decline': 'Decline',
                    'Toast.ItemTransferred': '...sent you an item',
                    'Toast.Duplicate item': 'Duplicate item',
                    'Toast.This would create an identical item': 'This would create an identical item',
                    'Toast.NotExecuted': 'Not executed',
                    'Toast.NoBlueprint': 'No blueprint',
                    'Toast.TooManyBlueprints': 'Too many blueprints',
                    'Toast.Open backpack': 'Open backpack',
                    'Toast.You Got Activity Points': 'You Got Activity Points',
                    'Toast.Your activity points have been claimed automatically': 'Your activity points have been claimed automatically. To maximize your yield, it is beneficial to claim them every day. Drag your Points-item to a web page, click it and claim.',
                    'Toast.NotDerezzed': 'Failed to Pick Up Item',
                    'Toast.NotYourItem': 'This is not your item.',

                    'Activity.TotalPoints': 'Total activity points',
                    'Activity.PointsChannelChat': 'Chat',
                    'Activity.PointsChannelEmote': 'Emote',
                    'Activity.PointsChannelGreet': 'Greet',
                    'Activity.PointsChannelNavigation': 'Navigate',
                    'Activity.PointsChannelPowerup': 'Powerup',
                    'Activity.PointsChannelItemApply': 'Item activity',
                    'Activity.PointsChannelPageOwned': 'Page ownership',
                    'Activity.PointsChannelSocial': 'Social activity',

                    'ErrorFact.UnknownError': 'Error',
                    'ErrorFact.NotRezzed': 'Item Not Dropped',
                    'ErrorFact.NotDerezzed': 'Failed to Pick Up Item',
                    'ErrorFact.NotAdded': 'Item Not Added',
                    'ErrorFact.NotChanged': 'Item Not Changed',
                    'ErrorFact.NoItemsReceived': 'No Items Received',
                    'ErrorFact.NotExecuted': 'Not Executed',
                    'ErrorFact.NotCreated': 'No Item Created',
                    'ErrorFact.NotDeleted': 'Item Not Deleted',
                    'ErrorFact.NotApplied': 'Item Not Applied',
                    'ErrorFact.NotSent': 'Not Sent',
                    'ErrorFact.NotProcessed': 'Not Processed',
                    'ErrorFact.ClaimFailed': 'Failed to Claim the Pge',
                    'ErrorFact.NotTransferred': 'Item Not Transferred',
                    'ErrorFact.NotDropped': 'Item Not Applied',

                    'ErrorReason.UnknownReason': '',
                    'ErrorReason.ItemAlreadyRezzed': 'Item already on a page.',
                    'ErrorReason.ItemNotRezzedHere': 'Item is not on this page',
                    'ErrorReason.ItemsNotAvailable': 'Items not available. The feature may be disabled.',
                    'ErrorReason.ItemDoesNotExist': 'This is not a known item.',
                    'ErrorReason.NoUserId': 'No user id. Maybe not logged in as item user.',
                    'ErrorReason.SeeDetail': '',
                    'ErrorReason.InvalidChecksum': 'Invalid checksum. Not a valid item.',
                    'ErrorReason.StillInCooldown': 'Still in cooldown period.',
                    'ErrorReason.InvalidPropertyValue': 'Property invalid.',
                    'ErrorReason.NotYourItem': 'This is not your item.',
                    'ErrorReason.ItemMustBeStronger': 'Your item is not stronger than the other.',
                    'ErrorReason.ItemIsNotTransferable': 'Item not transferable.',
                    'ErrorReason.NoMatch': 'Items do not match.',
                    'ErrorReason.NoSuchAspect': 'The item is missing a feature.',
                    'ErrorReason.NoSuchItem': 'Missing item',
                    'ErrorReason.Ambiguous': 'Ambiguous',
                    'ErrorReason.Insufficient': 'Insufficient',
                    'ErrorReason.StillInProgress': 'Still in progress',
                    'ErrorReason.MissingResource': 'Missing resource',
                    'ErrorReason.InvalidCommandArgument': 'Invalid command argument',
                    'ErrorReason.NetworkProblem': 'Netzwork problem',
                    'ErrorReason.CantDropOnSelf': 'The item can\'t be applied to yourself.',
                    'ErrorReason.NotDeletable': 'The item can\'t be deleted.',
                    'ErrorReason.ItemIsNotRezzed': 'The item is not on a page.',

                    'ErrorDetail.Applier.Apply': 'Applying an item to another',
                    'ErrorDetail.Pid.Id': 'Id',
                    'ErrorDetail.Pid.Actions': 'Actions',
                    'ErrorDetail.Pid.DocumentAspect': 'Dokument',

                    'ItemPid.Label': 'Label',
                    'ItemPid.Description': 'Description',
                    'ItemPid.Provider': 'Source',
                    'ItemPid.ClaimStrength': 'Strength',
                    'ItemPid.ClaimUrl': 'Domain',
                    'ItemPid.ClaimAccumulatedDuration': 'Accumulated',
                    'ItemPid.CommodityConversionFactor': 'Efficiency',
                    'ItemPid.OwnerName': 'Owner',
                    'ItemPid.DispenserAvailable': 'Remaining',
                    'ItemPid.TimedCooldownSec': 'Cooldown',
                    'ItemPid.NicknameText': 'Name',
                    'ItemPid.PointsTotal': 'Collected',
                    'ItemPid.PointsCurrent': 'Available',
                    'ItemPid.PointsUnclaimed': 'Unclaimed',
                    'ItemPid.RezzedDestination': 'Page',
                    'ItemPid.IsRezzed': 'Dropped',
                    'ItemPid.CoinCurrency': 'Currency',
                    'ItemPid.CoinAmount': 'Amount',
                    'ItemPid.IframeUrl': 'URL',
                    'ItemPid.IframeAuto': 'Autostart',
                    'ItemPid.IframeAutoRange': 'Automatic within a range',
                    'ItemPid.DocumentTitle': 'Title',
                    'ItemPid.ActivatableIsActive': 'Active',
                    'ItemPid.Web3WalletAddress': 'Wallet',
                    'ItemPid.Web3WalletNetwork': 'Network',
                    'ItemPid.MinerDurationSec': 'Duration',
                    'ItemPid.ResourceType': 'Resource',
                    'ItemPid.ResourceLevel': 'Quantity',
                    'ItemPid.ResourceLimit': 'Maximum',
                    'ItemPid.ResourceUnit': 'Unit',
                    'ItemPid.FiniteUseRemaining': 'Usages left',
                    'ItemPid.ProducerDurationSec': 'Duration',
                    'ItemPid.BlueprintDurationSec': 'Duration',
                    'ItemPid.ProducerEfficiency': 'Efficiency',
                    'ItemPid.MinerEfficiency': 'Efficiency',
                    'ItemPid.Web3ContractAddress': 'Contract',
                    'ItemPid.Web3ContractNetwork': 'Network',
                    'ItemPid.PageEffectRemaining': 'Usages left',

                    'ItemValue.true': 'Yes',
                    'ItemValue.false': 'No',
                    'ItemValue.nine3q': 'Local',
                    'ItemValue.n3q': 'Server',
                    'ItemValue.You': 'You',
                    'ItemValue.unknown': 'unknown',

                    'ItemLabel.Dot1': '1 Point',
                },
                'de-DE': {
                    'Extension.Disable': 'weblin.io ausschalten',
                    'Extension.Enable': 'weblin.io einschalten',

                    'StatusMessage.TabInvisible': 'Browser Tab inaktiv',

                    'Common.Close': 'Schließen',
                    'Common.Undock': 'Im eigenen Fenster öffnen',

                    'Intro.Got it': 'Verstanden',
                    'Intro.You': 'Du',

                    'Chatin.Enter chat here...': 'Chat Text hier...',
                    'Chatin.SendChat': 'Chat abschicken',

                    'Popup.title': 'Dein weblin',
                    'Popup.description': 'Wähle Name und Avatar, dann drücke [Speichern].',
                    'Popup.Name': 'Name',
                    'Popup.Random': 'Zufallsname',
                    'Popup.Avatar': 'Avatar',
                    'Popup.Save': 'Speichern',
                    'Popup.Saving': 'Speichern',
                    'Popup.Saved': 'Gespeichert',
                    'Popup.Show avatar': 'Avatar auf Seiten anzeigen',
                    'Popup.Uncheck to hide': 'Abschalten, um das Avatar auf Webseiten nicht anzuzeigen',

                    'Menu.Menu': 'Menü',
                    'Menu.Settings': 'Einstellungen',
                    'Menu.Stay Here': 'Bleiben bei Tabwechsel',
                    'Menu.Backpack': 'Rucksack',
                    'Menu.Chat Window': 'Chatverlauf',
                    'Menu.Video Conference': 'Videokonferenz',
                    'Menu.Chat': 'Sprechblase',
                    'Menu.Actions:': 'Aktionen:',
                    'Menu.wave': 'Winken',
                    'Menu.dance': 'Tanzen',
                    'Menu.cheer': 'Jubeln',
                    'Menu.kiss': 'Küssen',
                    'Menu.clap': 'Klatschen',
                    'Menu.laugh': 'Lachen',
                    'Menu.angry': 'Ärgern',
                    'Menu.deny': 'Ablehnen',
                    'Menu.yawn': 'Gähnen',
                    'Menu.Greet': 'Grüßen',
                    'Menu.Bye': 'Verabschieden',
                    'Menu.Private Chat': 'Privater Chat',
                    'Menu.Private Videoconf': 'Private Videokonferenz',
                    'Menu.Get weblin everywhere': 'Get weblin everywhere',

                    'Chatwindow.Chat History': 'Chat',
                    'Chatwindow.entered the room': '**hat den Raum betreten**',
                    'Chatwindow.was already there': '**war schon da**',
                    'Chatwindow.left the room': '**hat den Raum verlassen**',
                    'Chatwindow.appeared': '*erschienen*',
                    'Chatwindow.is present': '*ist da*',
                    'Chatwindow.disappeared': '*verschwunden*',
                    'Chatwindow.:': ':',
                    'Chatwindow.Toast.warning': '*Warnung',
                    'Chatwindow.Toast.notice': '*Hinweis',
                    'Chatwindow.Toast.question': '*Frage',
                    'Chatwindow.Clear': 'Leeren',
                    'Chatwindow.Enable Sound': 'Ton an',
                    'Chatwindow.Sound': 'Ton',

                    'PrivateChat.Private Chat with': 'Privater Chat mit',

                    'PrivateVidconf.Private Videoconference with': 'PrivateVidconf.Private Videokonferenz mit',

                    'Vidconfwindow.Video Conference': 'Videokonferenz',
                    'Settingswindow.Settings': 'Einstellungen',
                    'BackpackWindow.Inventory': 'Dein Rucksack',

                    // 'Backpack.Shredder': 'Schredder',
                    'Backpack.Go to item': 'Dort hingehen',
                    'Backpack.Derez item': 'Einsammeln',
                    'Backpack.Rez item': 'Ablegen',
                    'Backpack.Delete item': 'Löschen',
                    'Backpack.Active': 'Aktiv',
                    'Backpack.Too many items': 'Zu viele Gegenstände',
                    'Backpack.You are close to the limit of items on a page.': 'Du hast bald zu viele Gegenstände auf der Seite. Wenn die Grenze überschritten wird, werden alle Gegenstände ausgeblendet.',
                    'Backpack.Page items disabled.': 'Die Gegenstände auf der Seite sind ausgeblendet. Gehe in den Rucksack und sammle einige ein, um sie wieder anzuzeigen.',

                    'SimpleItemTransfer.senderConfirmQuestionTitle': 'Gegenstand übergeben',
                    'SimpleItemTransfer.senderConfirmQuestionText':
                        'Willst du {item} an {recipient} übergeben?',
                    'SimpleItemTransfer.senderConfirmQuestionYes': 'Ja, Gegenstand übergeben',
                    'SimpleItemTransfer.senderConfirmQuestionNo': 'Nein, behalten',
                    'SimpleItemTransfer.senderOfferWaitTitle': 'Gegenstand übergeben',
                    'SimpleItemTransfer.senderOfferWaitText': 'Biete {item} {recipient} an...',
                    'SimpleItemTransfer.senderOfferWaitCancel': 'Abbrechen und Gegenstand behalten',
                    'SimpleItemTransfer.recipientAcceptQuestionTitle': 'Gegenstand erhalten',
                    'SimpleItemTransfer.recipientAcceptQuestionText':
                        '{sender} will Dir einen Gegenstand geben.\n' +
                        'Gegenstand: {item}\n' +
                        'Nimmst du den Gegenstand an?',
                    'SimpleItemTransfer.recipientAcceptQuestionYes': 'Ja, Gegenstand annehmen',
                    'SimpleItemTransfer.recipientAcceptQuestionNo': 'Nein, ablehnen',
                    'SimpleItemTransfer.senderSenderTimeoutTitle': 'Gegenstand nicht übergeben',
                    'SimpleItemTransfer.senderSenderTimeoutText':
                        '{recipient} hat den Gegenstand nicht rechtzeitig angenommen.\n' +
                        'Du behälst {item}.',
                    'SimpleItemTransfer.senderSenderCanceledTitle': 'Gegenstand nicht übergeben',
                    'SimpleItemTransfer.senderSenderCanceledText':
                        'Du hast das Angebot an {recipient} zurückgezogen.\n' +
                        'Du behältst {item}.',
                    'SimpleItemTransfer.senderRecipientTimeoutTitle': 'Gegenstand nicht übergeben',
                    'SimpleItemTransfer.senderRecipientTimeoutText':
                        '{recipient} hat den Gegenstand nicht rechtzeitig angenommen.\n' +
                        'Du behältst {item}.',
                    'SimpleItemTransfer.senderRecipientRejectedTitle': 'Gegenstand nicht übergeben',
                    'SimpleItemTransfer.senderRecipientRejectedText':
                        '{recipient} hat den Gegenstand abgelehnt.\n' +
                        'Du behältst {item}.',
                    'SimpleItemTransfer.senderSentCompleteTitle': 'Gegenstand übergeben',
                    'SimpleItemTransfer.senderSentCompleteText': 'Du hast {item} an {recipient} übergeben.',
                    'SimpleItemTransfer.recipientConfirmTimeoutTitle': 'Gegenstand nicht erhalten',
                    'SimpleItemTransfer.recipientConfirmTimeoutText': '{item} von {sender} ist nicht rechtzeitig angekommen.',
                    'SimpleItemTransfer.recipientCanceledTitle': 'Gegenstand nicht erhalten',
                    'SimpleItemTransfer.recipientCanceledText':
                        '{sender} hat das Angebot zurückgezogen und behält {item}.',
                    'SimpleItemTransfer.recipientRetrieveCompleteTitle': 'Gegenstand erhalten',
                    'SimpleItemTransfer.recipientRetrieveCompleteText': '{item} von {sender} erhalten.',

                    'iframeApi.avatarCreateTitle': 'Avatar erstellen',
                    'iframeApi.avatarActivateTitle': 'Avatar aktivieren',
                    'iframeApi.avatarCreateActivateTitle': 'Avatar erstellen und aktivieren',
                    'iframeApi.avatarCreateText': 'Avatar {item} erstellen?',
                    'iframeApi.avatarActivateText': 'Avatar {item} aktivieren?',
                    'iframeApi.avatarCreateActivateText': 'Avatar {item} erstellen und aktivieren?',
                    'iframeApi.avatarCreateBtn': 'Erstellen',
                    'iframeApi.avatarActivateBtn': 'Aktivieren',
                    'iframeApi.avatarCreateActivateBtn': 'Erstellen und aktivieren',
                    'iframeApi.avatarCreateActivateCancelBtn': 'Nein, mach nichts',
                    'iframeApi.avatarCreatedTitle': 'Avatar erstellt',
                    'iframeApi.avatarActivatedTitle': 'Avatar aktiviert',
                    'iframeApi.avatarCreatedActivatedTitle': 'Avatar erstellt und aktiviert',

                    'Toast.Do not show this message again': 'Diese Nachricht nicht mehr anzeigen',
                    'Toast.greets': '...hat dich gegrüßt',
                    'Toast.byes': '...hat zum Abschied gegrüßt',
                    'Toast.tousles': '...hat dich gewuschelt',
                    'Toast.nudges': '...hat dich angestupst',
                    'Toast.Your claim has been removed': 'Der Anspruch wurde zurückgenommen',
                    'Toast.A stronger item just appeared': 'Ein stärkerer Gegenstand wurde gerade installiert.',
                    'Toast.greet back': 'Zurück grüßen',
                    'Toast.bye back': 'Auch verabschieden',
                    'Toast.tousle back': 'Zurück wuscheln',
                    'Toast.nudge back': 'Zurück stupsen',
                    'Toast.Really delete?': 'Wirklich löschen?',
                    'Toast.Yes, delete item': 'Ja, Gegenstand löschen',
                    'Toast.No, keep it': 'Nein, behalten',
                    'Toast.Wants to start a private videoconference': 'Lädt zu einer privaten Videokonferenz ein',
                    'Toast.Refuses to join the private videoconference': 'Lehnt die Videokonferenz ab',
                    'Toast.Accept': 'Annehmen',
                    'Toast.Decline': 'Ablehnen',
                    'Toast.ItemTransferred': '...hat dir einen Gegenstand gegeben',
                    'Toast.Duplicate item': 'Doppelter Gegenstand',
                    'Toast.This would create an identical item': 'Das würde einen identischen Gegenstand nochmal erzeugen',
                    'Toast.NotExecuted': 'Nicht ausgeführt',
                    'Toast.NoBlueprint': 'Kein Bauplan',
                    'Toast.TooManyBlueprints': 'Mehr als ein Bauplan',
                    'Toast.Open backpack': 'Rucksack öffnen',
                    'Toast.You Got Activity Points': 'Du hast Aktivitätspunkte bekommen',
                    'Toast.Your activity points have been claimed automatically': 'Deine Aktivitätspunkte wurden nach einiger Zeit automatisch zugeteilt. Um die Ausbeute zu steigern, ist es besser die Punkte selbst zu beanspruchen. Dafür trägt man den Punkte-Gegenstand auf eine Seite, klickt darauf und holt die Punkte. Am besten jeden Tag.',
                    'Toast.NotDerezzed': 'Von der Seite nehmen fehlgeschlagen',
                    'Toast.NotYourItem': 'Das ist nicht dein Gegenstand.',

                    'Activity.TotalPoints': 'Alle Aktivitätspunkte',
                    'Activity.PointsChannelChat': 'Chat',
                    'Activity.PointsChannelEmote': 'Emote',
                    'Activity.PointsChannelGreet': 'Grüßen',
                    'Activity.PointsChannelNavigation': 'Navigation',
                    'Activity.PointsChannelPowerup': 'Powerup',
                    'Activity.PointsChannelItemApply': 'Gegenstandsinteraktionen',
                    'Activity.PointsChannelPageOwned': 'Webseitenbesitz',
                    'Activity.PointsChannelSocial': 'Activität in Soizalen Netzen',

                    'ErrorFact.UnknownError': 'Fehler',
                    'ErrorFact.NotRezzed': 'Ablegen fehlgeschlagen',
                    'ErrorFact.NotDerezzed': 'Von der Seite nehmen fehlgeschlagen',
                    'ErrorFact.NotAdded': 'Gegenstand nicht hinzugefügt',
                    'ErrorFact.NotChanged': 'Gegenstand nicht geändert',
                    'ErrorFact.NoItemsReceived': 'Keine Gegenstände bekommen',
                    'ErrorFact.NotExecuted': 'Nicht ausgeführt',
                    'ErrorFact.NotCreated': 'Kein Gegenstand erstellt',
                    'ErrorFact.NotDeleted': 'Gegenstand nicht gelöscht',
                    'ErrorFact.NotApplied': 'Gegenstand nicht angewendet',
                    'ErrorFact.NotSent': 'Not Sent',
                    'ErrorFact.NotProcessed': 'Not verarbeitet',
                    'ErrorFact.ClaimFailed': 'Anspruch nicht durchgesetzt',
                    'ErrorFact.NotTransferred': 'Gegenstand nicht übertragen',
                    'ErrorFact.NotDropped': 'Gegenstand nicht angewendet',

                    'ErrorReason.UnknownReason': '',
                    'ErrorReason.ItemAlreadyRezzed': 'Gegenstand ist schon auf einer Seite.',
                    'ErrorReason.ItemNotRezzedHere': 'Gegenstand ist nicht auf dieser Seite',
                    'ErrorReason.ItemsNotAvailable': 'Keine Gegenstände verfügbar. Die Funktion ist vielleicht nicht eingeschaltet.',
                    'ErrorReason.ItemDoesNotExist': 'Dieser Gegenstand ist nicht bekannt.',
                    'ErrorReason.NoUserId': 'Keine Benutzerkennung. Möglicherweise nicht als Benutzer von Gegenständen angemeldet.',
                    'ErrorReason.SeeDetail': '',
                    'ErrorReason.InvalidChecksum': 'Falsche Checksumme. Kein zulässiger Gegenstand.',
                    'ErrorReason.StillInCooldown': 'Braucht noch Zeit, um sich zu erholen.',
                    'ErrorReason.InvalidPropertyValue': 'Falsche Eigenschaft.',
                    'ErrorReason.NotYourItem': 'Das ist nicht dein Gegenstand.',
                    'ErrorReason.ItemMustBeStronger': 'Der Gegenstand ist nicht stärker als der andere.',
                    'ErrorReason.ItemIsNotTransferable': 'Der Gegenstand ist nicht übertragbar.',
                    'ErrorReason.NoMatch': 'Gegenstände passen nicht.',
                    'ErrorReason.NoSuchAspect': 'Dem Gegenstand fehlt eine Eigenschaft.',
                    'ErrorReason.NoSuchItem': 'Gegenstand fehlt',
                    'ErrorReason.Ambiguous': 'Mehrdeutig',
                    'ErrorReason.Insufficient': 'Ungenügend',
                    'ErrorReason.StillInProgress': 'Dauert noch an',
                    'ErrorReason.MissingResource': 'Zutat fehlt',
                    'ErrorReason.InvalidCommandArgument': 'Falsches Befehlsargument',
                    'ErrorReason.NetworkProblem': 'Netzwerkproblem',
                    'ErrorReason.CantDropOnSelf': 'Der Gegenstand kann nicht auf dich selbst angewandt werden.',
                    'ErrorReason.NotDeletable': 'Der Gegenstand kann nicht gelöscht werden.',
                    'ErrorReason.ItemIsNotRezzed': 'Der Gegenstand kann nicht auf einer Seite.',

                    'ErrorDetail.Applier.Apply': 'Beim Anwenden eines Gegenstands auf einen anderen.',
                    'ErrorDetail.Pid.Id': 'Id',
                    'ErrorDetail.Pid.Actions': 'Aktionen',
                    'ErrorDetail.Pid.DocumentAspect': 'Dokument',

                    'ItemPid.Label': 'Bezeichnung',
                    'ItemPid.Description': 'Beschreibung',
                    'ItemPid.Provider': 'Quelle',
                    'ItemPid.ClaimStrength': 'Stärke',
                    'ItemPid.ClaimUrl': 'Domain',
                    'ItemPid.ClaimAccumulatedDuration': 'Angesammelt',
                    'ItemPid.CommodityConversionFactor': 'Effzienz',
                    'ItemPid.OwnerName': 'Besitzer',
                    'ItemPid.DispenserAvailable': 'Übrig',
                    'ItemPid.TimedCooldownSec': 'Erholungszeit',
                    'ItemPid.NicknameText': 'Name',
                    'ItemPid.PointsTotal': 'Gesammelt',
                    'ItemPid.PointsCurrent': 'Verfügbar',
                    'ItemPid.PointsUnclaimed': 'Unbeansprucht',
                    'ItemPid.RezzedDestination': 'Webseite',
                    'ItemPid.IsRezzed': 'Auf Webseite',
                    'ItemPid.CoinCurrency': 'Währung',
                    'ItemPid.CoinAmount': 'Betrag',
                    'ItemPid.IframeUrl': 'URL',
                    'ItemPid.IframeAuto': 'Automatisch',
                    'ItemPid.IframeAutoRange': 'Automatisch in einem Bereich',
                    'ItemPid.DocumentTitle': 'Titel',
                    'ItemPid.ActivatableIsActive': 'Aktiv',
                    'ItemPid.Web3WalletAddress': 'Wallet',
                    'ItemPid.Web3WalletNetwork': 'Netzwerk',
                    'ItemPid.MinerDurationSec': 'Dauer',
                    'ItemPid.ResourceType': 'Inhalt',
                    'ItemPid.ResourceLevel': 'Menge',
                    'ItemPid.ResourceLimit': 'Maximum',
                    'ItemPid.ResourceUnit': 'Einheit',
                    'ItemPid.FiniteUseRemaining': 'Nutzbar noch',
                    'ItemPid.ProducerDurationSec': 'Dauer',
                    'ItemPid.BlueprintDurationSec': 'Dauer',
                    'ItemPid.ProducerEfficiency': 'Effizienz',
                    'ItemPid.MinerEfficiency': 'Effizienz',
                    'ItemPid.Web3ContractAddress': 'Contract',
                    'ItemPid.Web3ContractNetwork': 'Netzwerk',
                    'ItemPid.PageEffectRemaining': 'Nutzbar noch',

                    'ItemValue.true': 'Ja',
                    'ItemValue.false': 'Nein',
                    'ItemValue.nine3q': 'Lokal',
                    'ItemValue.n3q': 'Server',
                    'ItemValue.You': 'Du',
                    'ItemValue.unknown': 'unbekannt',

                    'ItemLabel.Points': 'Punkte',
                    'ItemLabel.Dot1': '1 Punkt',
                    'ItemLabel.PublicViewing': 'Public Viewing',
                },
            },
            'serviceUrl': '',
        },

        _last: 0
    };

    static get(key: string, defaultValue: unknown = undefined): any // @Todo: Actual type is unknown.
    {
        // If chain instead of coalesque chain for easier debugging of generated JavaScript:
        let result = null;
        if (is.nil(result)) {
            result = Config.getDev(key);
        }
        if (is.nil(result)) {
            result = Config.getOnline(key);
        }
        if (is.nil(result)) {
            result = Config.getStatic(key);
        }
        if (is.nil(result)) {
            result = defaultValue;
        }
        return result;
    }

    static getArray(key: string, defaultValue: Array<any> = []): Array<any>
    {
        return <Array<any>>this.get(key, defaultValue);
    }

    static getDev(key: string): unknown { return Config.getFromTree(this.devConfig, key); }
    static getOnline(key: string): unknown { return Config.getFromTree(this.onlineConfig, key); }
    static getStatic(key: string): unknown { return Config.getFromTree(this.staticConfig, key); }

    private static getFromTree(tree: { [p: string]: unknown }, key: string): unknown
    {
        const parts = key.split('.');
        let current: unknown = tree;
        parts.forEach(part =>
        {
            current = current?.[part];
        });
        return current ?? null;
    }

    private static setInTree(tree: { [p: string]: unknown }, key: string, value: unknown)
    {
        const parts = key.split('.');
        if (parts.length === 0) {
            return;
        }
        const lastPart = parts.pop();
        let current = tree;
        parts.forEach(part =>
        {
            const node = current?.[part];
            current = is.object(node) ? node : {};
        });
        current[lastPart] = value;
    }

    static getDevTree(): { [p: string]: unknown } { return this.devConfig; }
    static getOnlineTree(): { [p: string]: unknown } { return this.onlineConfig; }
    static getStaticTree(): { [p: string]: unknown } { return this.staticConfig; }

    static setOnline(key: string, value: unknown)
    {
        log.debug('Config.setOnline', key);
        return Config.setInTree(this.onlineConfig, key, value);
    }

    static setDevTree(tree: { [p: string]: unknown })
    {
        if (Config.get('log.all', false) || Config.get('log.startup', true)) {
            log.info('Config.setDevTree');
        }
        this.devConfig = tree;
    }

    static setOnlineTree(tree: { [p: string]: unknown }): void
    {
        if (Config.get('log.all', false) || Config.get('log.startup', true)) {
            log.info('Config.setOnlineTree');
        }
        this.onlineConfig = tree;
    }

    static setStaticTree(tree: { [p: string]: unknown }): void
    {
        if (Config.get('log.all', false) || Config.get('log.startup', true)) {
            log.info('Config.setStaticTree');
        }
        this.staticConfig = tree;
    }

}
