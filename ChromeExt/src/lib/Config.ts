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
            clusterName: 'prod',
        },
        test: {
            itemServiceRpcUrl: 'http://localhost:5000/ItemApi',
        },
        system: {
            displayProtectShadowDomAnchor: true,
            displayPopupShadowDomAnchor: false,
            submenuHoverOpenDelaySec: 0.5,
            submenuCloseOnItemHoverDelaySec: 0.5,
            windowContainerMarginTop: 3, // [px]
            windowContainerMarginRight: 3, // [px]
            windowContainerMarginBottom: 3, // [px]
            windowContainerMarginLeft: 3, // [px]
            sendTabStatsToBackgroundPageDelaySec: 0.1,
            tabStatsRecentChatAgeSecs: 1, // Keep this small. Indirectly used for edge detection in BrowserActionGui.
            clientBackgroundWaitReadyChecksMax: 100, // Content gives up until next navigation after that many failed checks. This has to account for slow config and backpack retrieval.
            clientBackgroundWaitReadyCheckIntervalSec: 1, // This also often is the minimum content start delay on first navigation when background isn't already running.
            clientBackgroundKeepaliveMessageIntervalSec: 1, // Thirty seconds minus safety margin to keep background service worker alive. Also the minimum maintenance interval for background components.
            clientBackgroundMessagePipeReopenIntervalSec: 241, // Five minutes minus safety margin to keep ports to background service worker alive.
            clientBackgroundSendTimeoutSec: 10, // How long before giving up sending a message.
            clientBackgroundResponseTimeoutSec: 600, // How long before giving up waiting for a response.
        },
        browserAction: {
            normalBadgeColor: '#DDDDDD',
            attentionBadgeColor: '#992AD1',
            attentionBlinkBadgeColor: '#DDDDDD',
            attentionBlinkCount: 3, // How often to blink for attention level 2
            attentionBlinkDurationSec: 1, // How long each blink takes.
        },
        log: {
            all: false,
            startup: false,
            backgroundTraffic: false,
            backgroundPresenceManagement: false,
            clientBackgroundMessagePipeManagement: false, // Opening/closing of message pipes, ping messages and discarding of messages caused by closure or timeouts.
            clientBackgroundMessages: false, // All messages but pings going to or coming from the background!
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
            badges: false,
            SimpleItemTransfer: false,
            chatHistory: false,
        },
        pointerEventDispatcher: {
            pointerOpaqueOpacityMin: 0.03, // works with Photoshop 3% Opacity (e.g. Screen item)
            pointerLongclickMinSec: 0.5,
            pointerDoubleclickMaxSec: 0.25,
            pointerDragStartDistance: 3.0,
            pointerDropTargetUpdateIntervalSec: 0.25,

            // These are here to avoid them being affected by log.all:
            logIncommingPointer: false, // Enter/leave and move excluded if logWithEnterLeave and logWithMove are false.
            logIncommingMouse: false, // Enter/leave and move excluded if logWithEnterLeave and logWithMove are false.
            logOutgoingPointer: false, // Enter/leave and move excluded if logWithEnterLeave and logWithMove are false.
            logOutgoingMouse: false, // Enter/leave and move excluded if logWithEnterLeave and logWithMove are false.
            logButtons: false,
            logDrag: false, // Enter/leave excluded if logWithEnterLeave is false.
            logHover: false, // Does nothing without also enabling logWithEnterLeave or logWithMove.
            logWithEnterLeave: false, // Enable to add enter/leave event logging when logIncomming*/logDrag/logHover is enabled.
            logWithMove: false, // Enable to add move event logging when logIncomming*/logDrag/logHover is enabled.
        },
        client: {
            name: 'weblin.io',
            notificationToastDurationSec: 30,
            showIntroYou: 10,
            showTutorial: 6,
        },
        toast: {
            durationSecByType: {
                PointsAutoClaimed: 5,
                PointsClaimReminder: 30,
                FallenBackToOldNickname: 600,
            },
            hasDontShowAgainOptionByType: {
                FallenBackToOldNickname: false,
            },
        },
        settings: {
            nameGeneratorBlocklistRetries: 30,
            nameGeneratorBlocklist: ['black', 'bronze', 'brown', 'chocolate', 'coffee', 'maroon', 'white', 'yellow'],
            avatarGeneratorLink: 'https://www.weblin.io/Avatars',
        },
        design: {
            name: 'basic',
            version: ''
        },
        vp: {
            deferPageEnterSec: 0.3,
            vpiRoot: 'https://webex.vulcan.weblin.com/vpi/v7/root.xml',
            vpiMaxIterations: 15,
            ignoredDomainSuffixes: ['video.weblin.io', 'vulcan.weblin.com', 'meet.jit.si'],
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
            roompublicMaxAgeSec: 3 * 24 * 3600,
            roomprivateMaxAgeSec: 3 * 24 * 3600,
            messageDeduplicationMaxAgeSec: 1, // Max message age for duplicate detection.
            maintenanceIntervalSec: 3600, // Minimum seconds between history prunings for each history.
            maintenanceCheckIntervalSec: 10, // Minimum time between searches for chat histories to prune.
            maintenanceWriteCount: 1000, // Stop after deleting/updating this much messages and chats.
        },
        room: {
            fadeInSec: 0.3,
            quickSlideSec: 0.1,
            checkPageUrlSec: 3.0,
            defaultAvatarSpeedPixelPerSec: 100,
            randomEnterPosXMin: 300,
            randomEnterPosXMax: 600,
            showNicknameTooltip: true,
            chatBubblesPerChatoutMax: 3,
            chatBubblesMinTimeRemSec: 3,
            chatBubbleFastFadeSec: 0.75,
            chatBubbleFadeStartSec: 110.0,
            chatBubbleFadeDurationSec: 10.0,
            chatBubblesDefaultBottom: 100,
            chatBubblesDefaultBottomAvatarHeightFactors: [
                { avatarHeightMin: 101, bottomOffset: 190 },
                { avatarHeightMin: 0, bottomOffset: 110 },
            ],
            chatinDefaultBottom: 35,
            chatinDefaultBottomAvatarHeightFactors: [
                { avatarHeightMin: 101, bottomOffset: 90 },
                { avatarHeightMin: 0, bottomOffset: 35 },
            ],
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
            // vidconfUrl: 'https://video.weblin.io/Vidconf?room=weblin{room}&name={name}',
            vidconfUrl: 'https://meet.jit.si/weblin{room}#userInfo.displayName=%22{name}%22&config.prejoinPageEnabled=false&config.disableInviteFunctions=true&config.doNotStoreRoom=true&config.resolution=true&config.enableInsecureRoomNameWarning=false&interfaceConfig.SHOW_CHROME_EXTENSION_BANNER=false',
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
            showInvisibleItems: false,
            stayOnTabChange: false,
        },
        xmpp: {
            service: 'wss://xmpp.vulcan.weblin.com/xmpp-websocket',
            domain: 'xmpp.vulcan.weblin.com',
            maxMucEnterRetries: 4,
            deferUnavailableSec: 3.0,
            deferAwaySec: 0.2,
            deferAwailable: 0.05,
            detectServerCompletelyIgnoredPresenceMaybeBecauseOfInvalidNicknameTimeoutSec: 30,
            resendPresenceAfterResourceChangeBecauseServerSendsOldPresenceDataWithNewResourceToForceNewDataDelaySec: 1.0,
            versionQueryShareOs: true,
            verboseVersionQuery: false,
            sendVerboseVersionQueryResponse: true,
            verboseVersionQueryWeakAuth: 'K4QfJptO750u',
            stanzaOutQueueMaxAgeSec: 30,
        },
        avatars: {
            animationsProxyUrlTemplate: 'https://webex.vulcan.weblin.com/Avatar/InlineData?url={url}',
            dataUrlProxyUrlTemplate: 'https://webex.vulcan.weblin.com/Avatar/DataUrl?url={url}',

            avatarConfigUrlTemplate: 'https://webex.vulcan.weblin.com/avatars/{id}/config.xml',
            animationGroupBlocklistForAvatarMenu: [
                'idle', 'moveleft', 'moveright', 'chat', // Non-emotes.
                'sleep', // Often defined but not backed with an actual image/animation file.
            ],

            gallery: [
                { id: 'rpm/1/3sVTMhTFeT', previewImage: 'idle.webp' },
                { id: 'rpm/1/7EVSnaU8rL', previewImage: 'idle.webp' },
                { id: 'rpm/1/8DUHPl702z', previewImage: 'idle.webp' },
                { id: 'rpm/1/ggpQbb36LT', previewImage: 'idle.webp' },
                { id: 'rpm/1/GljSYaxN46', previewImage: 'idle.webp' },
                { id: 'rpm/1/hwCSrjDHHE', previewImage: 'idle.webp' },
                { id: 'rpm/1/JsgczP7n2B', previewImage: 'idle.webp' },
                { id: 'rpm/1/LjdallM9gT', previewImage: 'idle.webp' },
                { id: 'rpm/1/mDZofC1qCo', previewImage: 'idle.webp' },
                { id: 'rpm/1/OetuMmhQXb', previewImage: 'idle.webp' },
                { id: 'rpm/1/qY7GZHsM23', previewImage: 'idle.webp' },
                { id: 'rpm/1/SXA0Nq9XzL', previewImage: 'idle.webp' },
                { id: 'rpm/1/tbKYIf5oIG', previewImage: 'idle.webp' },
                { id: 'rpm/1/uPOFmThFDe', previewImage: 'idle.webp' },
                { id: 'rpm/1/xYFUV5adnh', previewImage: 'idle.webp' },
                { id: 'rpm/1/5N0rTP67lK', previewImage: 'idle.webp' },
                { id: 'rpm/1/7dqL1WqpDL', previewImage: 'idle.webp' },
                { id: 'rpm/1/7N6zk0F2FL', previewImage: 'idle.webp' },
                { id: 'rpm/1/80fUee3j1i', previewImage: 'idle.webp' },
                { id: 'rpm/1/91zlk2dKrk', previewImage: 'idle.webp' },
                { id: 'rpm/1/AF09zwGD7Q', previewImage: 'idle.webp' },
                { id: 'rpm/1/AgRTx0JTFi', previewImage: 'idle.webp' },
                { id: 'rpm/1/BgCnH42uhh', previewImage: 'idle.webp' },
                { id: 'rpm/1/DEKQjbtXvi', previewImage: 'idle.webp' },
                { id: 'rpm/1/dOJ94BwPtM', previewImage: 'idle.webp' },
                { id: 'rpm/1/e7rSvHzk3h', previewImage: 'idle.webp' },
                { id: 'rpm/1/jAHVBlwwr3', previewImage: 'idle.webp' },
                { id: 'rpm/1/JAvaLfsSoK', previewImage: 'idle.webp' },
                { id: 'rpm/1/kiIcobbO3E', previewImage: 'idle.webp' },
                { id: 'rpm/1/KMaYLf0SGU', previewImage: 'idle.webp' },
                { id: 'rpm/1/krODP7H3FV', previewImage: 'idle.webp' },
                { id: 'rpm/1/NAKM9Up4i2', previewImage: 'idle.webp' },
                { id: 'rpm/1/P1DgrgwNpA', previewImage: 'idle.webp' },
                { id: 'rpm/1/PHxkfugqsC', previewImage: 'idle.webp' },
                { id: 'rpm/1/ShctuH3ewz', previewImage: 'idle.webp' },
                { id: 'rpm/1/t0JwSJxWtj', previewImage: 'idle.webp' },
                { id: 'rpm/1/tjHvcgG9Qa', previewImage: 'idle.webp' },
                { id: 'rpm/1/Vgnx46tjKz', previewImage: 'idle.webp' },
                { id: 'rpm/1/Yrub7gyySe', previewImage: 'idle.webp' },
                { id: 'rpm/1/KlfuTb0b8x', previewImage: 'idle.webp' },
                { id: 'rpm/1/Ut3fHJTcjg', previewImage: 'idle.webp' },
                { id: 'rpm/1/bj6x4GMtsE', previewImage: 'idle.webp' },
                { id: 'rpm/1/KOuogLdiWK', previewImage: 'idle.webp' },
                { id: 'rpm/1/704RAc2PhE', previewImage: 'idle.webp' },
                { id: 'rpm/1/34xnWG8zks', previewImage: 'idle.webp' },
                { id: 'rpm/1/eyauvBd1x7', previewImage: 'idle.webp' },
                { id: 'rpm/1/79zDaE6MER', previewImage: 'idle.webp' },
            ],
            randomAvatarIds: [
                'rpm/1/3sVTMhTFeT', 'rpm/1/7EVSnaU8rL', 'rpm/1/8DUHPl702z', 'rpm/1/ggpQbb36LT', 'rpm/1/GljSYaxN46',
                'rpm/1/hwCSrjDHHE', 'rpm/1/JsgczP7n2B', 'rpm/1/LjdallM9gT', 'rpm/1/mDZofC1qCo', 'rpm/1/OetuMmhQXb',
                'rpm/1/qY7GZHsM23', 'rpm/1/SXA0Nq9XzL', 'rpm/1/tbKYIf5oIG', 'rpm/1/uPOFmThFDe', 'rpm/1/xYFUV5adnh',
                'rpm/1/5N0rTP67lK', 'rpm/1/7dqL1WqpDL', 'rpm/1/7N6zk0F2FL', 'rpm/1/80fUee3j1i', 'rpm/1/91zlk2dKrk',
                'rpm/1/AF09zwGD7Q', 'rpm/1/AgRTx0JTFi', 'rpm/1/BgCnH42uhh', 'rpm/1/DEKQjbtXvi', 'rpm/1/dOJ94BwPtM',
                'rpm/1/e7rSvHzk3h', 'rpm/1/jAHVBlwwr3', 'rpm/1/JAvaLfsSoK', 'rpm/1/kiIcobbO3E', 'rpm/1/KMaYLf0SGU',
                'rpm/1/krODP7H3FV', 'rpm/1/NAKM9Up4i2', 'rpm/1/P1DgrgwNpA', 'rpm/1/PHxkfugqsC', 'rpm/1/ShctuH3ewz',
                'rpm/1/t0JwSJxWtj', 'rpm/1/tjHvcgG9Qa', 'rpm/1/Vgnx46tjKz', 'rpm/1/Yrub7gyySe', 'rpm/1/KlfuTb0b8x',
                'rpm/1/Ut3fHJTcjg', 'rpm/1/bj6x4GMtsE', 'rpm/1/KOuogLdiWK', 'rpm/1/704RAc2PhE', 'rpm/1/34xnWG8zks',
                'rpm/1/eyauvBd1x7', 'rpm/1/79zDaE6MER',
            ],

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
            showInvisibleItems: false,
            filters: [],
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
            },
        },
        badges: {
            enabled: true,
            badgesEnabledMax: 3,
            sendPresenceDelaySec: 1,
            // Distances from avatar bottom center:
            displayAvatarYTop: 200,
            displayAvatarXRight: 100,
            displayAvatarYBottom: 45,
            displayAvatarXLeft: -80,
            infoWindowBadgeDistanceY: 10, // Distance between info bottom and badge top.
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
        tutorial: {
            experiencedUserPointsLimit: 200,
            defaultWidth: 1040,
            defaultHeight: 665,
            defaultBottom: 400,
            defaultLeft: 50,
            videoArgs: '?autoplay=1&controls=1&fs=0&iv_load_policy=3&showinfo=0&rel=0&cc_load_policy=1',
            videoHtmlAllow: 'allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen',
            videos: [
                { title: 'How weblin Works And What You Can Do With It', url: 'https://www.youtube.com/embed/bTX9KncEI9E', },
                { title: 'Configure Your Own Avatar With weblin.io', url: 'https://www.youtube.com/embed/ft3IyKuKnZs', },
                { title: 'How to communicate with other weblins', url: 'https://www.youtube.com/embed/H-8oOhB1zDE', },
                { title: 'Useful Tools For The Web - Chat GPT For Every Web Page', url: 'https://www.youtube.com/embed/8GbpX2fKveM', },
                { title: 'Gaming Features - Points & Flags', url: 'https://www.youtube.com/embed/3UhTVhzQJ3c', },
                { title: 'Gaming Features - Mining, Crafting & Recycling', url: 'https://www.youtube.com/embed/7u_g4tmZ3F4', },
            ]
        },
        about: {
            defaultWidth: 650,
            defaultHeight: 300,
            defaultBottom: 400,
            defaultLeft: 50,
            landingPage: 'https://www.weblin.io/',
            projectPage: 'https://www.weblin.io/Start',
            privacyPolicy: 'https://www.weblin.io/PrivacyPolicy',
            extensionLink: 'https://chrome.google.com/webstore/detail/weblin/cgfkfhdinajjhfeghebnljbanpcjdlkm',
            description: 'The Web is a virtual world. You meet other people - on all pages. </br></br>You have an avatar on every web page and you meet other people who are on the same page at the same time. It\'s anonymous. It\'s on every web page. It\'s real-time.',
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
                    'Extension.Hide': 'Hide weblin.io',
                    'Extension.Show': 'Show weblin.io',

                    'StatusMessage.TabInvisible': 'Browser tab inactive',
                    'StatusMessage.GuiHidden': 'GUI hidden',

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
                    'Popup.Create your own avatar': '...or create your own avatar in the new ',
                    'Popup.Avatar Generator': 'avatar generator',

                    'Menu.Menu': 'Menu',
                    'Menu.Settings': 'Settings',
                    'Menu.Stay Here': 'Stay on tab change',
                    'Menu.Backpack': 'Backpack',
                    'Menu.BadgesEditMode': 'Badges',
                    'Menu.Chat Window': 'Chat History',
                    'Menu.Video Conference': 'Video Conference',
                    'Menu.Chat': 'Chat',
                    'Menu.About weblin': 'About weblin',
                    'Menu.Tutorials': 'Tutorials',
                    'Menu.Emotes': 'Emotes',
                    'Menu.wave': 'Wave',
                    'Menu.dance': 'Dance',
                    'Menu.cheer': 'Cheer',
                    'Menu.kiss': 'Kiss',
                    'Menu.cry': 'Cry',
                    'Menu.clap': 'Clap',
                    'Menu.laugh': 'Laugh',
                    'Menu.angry': 'Angry',
                    'Menu.agree': 'Agree',
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
                    'Chatwindow.RetentionDuration': 'Stored for {duration}',
                    'Chatwindow.RetentionDurationForever': 'Stored forever',

                    '/do wave': '*waves*',
                    '/do dance': '*dances*',
                    '/do cheer': '*cheer*',
                    '/do cry': '*cries*',
                    '/do kiss': '*kisses*',
                    '/do clap': '*claps*',
                    '/do laugh': '*laughs*',
                    '/do angry': '*is angry*',
                    '/do deny': '*denies*',
                    '/do agree': '*agrees*',
                    '/do yawn': '*yawns*',

                    'PrivateChat.Private Chat with': 'Private Chat with',

                    'PrivateVidconf.Private Videoconference with': 'Private Videoconference with',

                    'Vidconfwindow.Video Conference': 'Video Conference',
                    'Settingswindow.Settings': 'Settings',
                    'BackpackWindow.Inventory': 'Your Backpack',
                    'TutorialWindow.Tutorial': 'Tutorial',
                    'AboutWindow.About': 'About weblin',

                    // 'Backpack.Shredder': 'Shredder',
                    'Backpack.Go to item': 'Go there',
                    'Backpack.Derez item': 'Pick up',
                    'Backpack.Rez item': 'Drop',
                    'Backpack.Delete item': 'Delete',
                    'Backpack.Active': 'Active',
                    'Backpack.Too many items': 'Too many items',
                    'Backpack.You are close to the limit of items on a page.': 'You are close to the limit of items on a page. All items will be hidden if the number rises above the limit.',
                    'Backpack.Page items disabled.': 'Page items have been disabled. Collect items from the backpack to show them again.',

                    'TutorialWindow.Previous': 'Previous',
                    'TutorialWindow.Next': 'Next',
                    'TutorialWindow.Do not show again': 'Don\'t show again',

                    'AboutWindow.Version': 'Version',
                    'AboutWindow.Variant': 'Variant',
                    'AboutWindow.Language': 'Language',
                    'AboutWindow.Description': 'Description',
                    'AboutWindow.Landing page': 'Landing page',
                    'AboutWindow.Project page': 'Project page',
                    'AboutWindow.Extension link': 'Extension',

                    'Badges.editModeHint': 'Drop your badges here',

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
                    'SimpleItemTransfer.senderRecipientUnableToAcceptTitle': 'Item Not Sent',
                    'SimpleItemTransfer.senderRecipientUnableToAcceptText':
                        '{recipient} has no backpack.\n' +
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

                    'Toast.Do not show this message again': 'Don\'t show this message again',
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
                    'Toast.c': 'You Got Activity Points',
                    'Toast.Your activity points have been claimed automatically': 'Your activity points have been claimed automatically. To maximize your yield, it is beneficial to claim them every day. ',
                    'Toast.You Can Claim Activity Points': 'You Can Claim Activity Points',
                    'Toast.Activity points can be claimed': 'You can claim your new activity points now. To maximize your yield, it is beneficial to claim them every day. Drag your Points-item to a web page, click it and claim.',
                    'Toast.NotDerezzed': 'Failed to Pick Up Item',
                    'Toast.NotYourItem': 'This is not your item.',
                    'Toast.BadgeNotEnabled': 'Failed to enable badge',
                    'Toast.TooManyBadgesEnabled': 'You already have the maximum count of badges enabled.',
                    'Toast.FallenBackToOldNickBecauseServerIgbnoredPresenceTitle': 'New name refused',
                    'Toast.FallenBackToOldNickBecauseServerIgbnoredPresenceText': 'The server doesn\'t like your new name. Please use another name.',
                    'Toast.Open settings': 'Open settings',

                    'Activity.TotalPoints': 'Total activity points',
                    'Activity.PointsChannelChat': 'Chat',
                    'Activity.PointsChannelEmote': 'Emote',
                    'Activity.PointsChannelGreet': 'Greet',
                    'Activity.PointsChannelNavigation': 'Navigate',
                    'Activity.PointsChannelPowerup': 'Powerup',
                    'Activity.PointsChannelItemApply': 'Item activity',
                    'Activity.PointsChannelPageOwned': 'Page ownership',
                    'Activity.PointsChannelSocial': 'Social network activity',

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
                    'ItemPid.PointsTotal': 'Total collected points',
                    'ItemPid.PointsCurrent': 'Points available for payout as dots',
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
                    'ItemPid.BadgeTitle': 'Title',
                    'ItemPid.BadgeDescription': 'Description',
                    'ItemPid.BadgeLinkUrl': 'Link',
                    'ItemPid.BadgeLinkLabel': 'Link Text',
                    'ItemPid.BadgeIsActive': 'Attached',

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
                    'Extension.Hide': 'weblin.io ausgeblenden',
                    'Extension.Show': 'weblin.io einblenden',

                    'StatusMessage.TabInvisible': 'Browser Tab inaktiv',
                    'StatusMessage.GuiHidden': 'GUI ausgeblendet',

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
                    'Popup.Create your own avatar': '...oder mache einen eigenen Avatar mit dem neuen ',
                    'Popup.Avatar Generator': 'Avatar-Generator',

                    'Menu.Menu': 'Menü',
                    'Menu.Settings': 'Einstellungen',
                    'Menu.Stay Here': 'Bleiben bei Tabwechsel',
                    'Menu.Backpack': 'Rucksack',
                    'Menu.BadgesEditMode': 'Sticker',
                    'Menu.Chat Window': 'Chatverlauf',
                    'Menu.Video Conference': 'Videokonferenz',
                    'Menu.Chat': 'Sprechblase',
                    'Menu.About weblin': 'Über weblin',
                    'Menu.Tutorials': 'Tutorials',
                    'Menu.Emotes': 'Emotes',
                    'Menu.wave': 'Winken',
                    'Menu.dance': 'Tanzen',
                    'Menu.cheer': 'Jubeln',
                    'Menu.kiss': 'Küssen',
                    'Menu.cry': 'Weinen',
                    'Menu.clap': 'Klatschen',
                    'Menu.laugh': 'Lachen',
                    'Menu.angry': 'Ärgern',
                    'Menu.agree': 'Zustimmen',
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
                    'Chatwindow.RetentionDuration': 'Gespeichert für {duration}',
                    'Chatwindow.RetentionDurationForever': 'Gespeichert für immer',

                    '/do wave': '*winkt*',
                    '/do dance': '*tanzt*',
                    '/do cheer': '*jubelt*',
                    '/do cry': '*weint*',
                    '/do kiss': '*Küsschen*',
                    '/do clap': '*klatscht*',
                    '/do laugh': '*lacht*',
                    '/do angry': '*ärgert sich*',
                    '/do deny': '*lehnt ab*',
                    '/do agree': '*stimmt zu*',
                    '/do yawn': '*gähnt*',

                    'PrivateChat.Private Chat with': 'Privater Chat mit',

                    'PrivateVidconf.Private Videoconference with': 'Private Videokonferenz mit',

                    'Vidconfwindow.Video Conference': 'Videokonferenz',
                    'Settingswindow.Settings': 'Einstellungen',
                    'BackpackWindow.Inventory': 'Dein Rucksack',
                    'TutorialWindow.Tutorial': 'Tutorial',
                    'AboutWindow.About': 'Über weblin',

                    // 'Backpack.Shredder': 'Schredder',
                    'Backpack.Go to item': 'Dort hingehen',
                    'Backpack.Derez item': 'Einsammeln',
                    'Backpack.Rez item': 'Ablegen',
                    'Backpack.Delete item': 'Löschen',
                    'Backpack.Active': 'Aktiv',
                    'Backpack.Too many items': 'Zu viele Gegenstände',
                    'Backpack.You are close to the limit of items on a page.': 'Du hast bald zu viele Gegenstände auf der Seite. Wenn die Grenze überschritten wird, werden alle Gegenstände ausgeblendet.',
                    'Backpack.Page items disabled.': 'Die Gegenstände auf der Seite sind ausgeblendet. Gehe in den Rucksack und sammle einige ein, um sie wieder anzuzeigen.',

                    'TutorialWindow.Previous': 'Zurück',
                    'TutorialWindow.Next': 'Weiter',
                    'TutorialWindow.Do not show again': 'Nicht mehr anzeigen',

                    'AboutWindow.Version': 'Version',
                    'AboutWindow.Variant': 'Variante',
                    'AboutWindow.Language': 'Sprache',
                    'AboutWindow.Description': 'Beschreibung',
                    'AboutWindow.Landing page': 'Landingpage',
                    'AboutWindow.Project page': 'Projektseite',
                    'AboutWindow.Extension link': 'Extension',

                    'Badges.editModeHint': 'Lege deine Sticker hier ab',

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
                    'SimpleItemTransfer.senderRecipientUnableToAcceptTitle': 'Gegenstand nicht übergeben',
                    'SimpleItemTransfer.senderRecipientUnableToAcceptText':
                        '{recipient} hat keinen Rucksack.\n' +
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
                    'iframeApi.avatarCreateActivateCancelBtn': 'Nein, nichts machen',
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
                    'Toast.Your activity points have been claimed automatically': 'Deine Aktivitätspunkte wurden nach einiger Zeit automatisch zugeteilt. Um die Ausbeute zu steigern, ist es am besten, die Punkte jeden Tag zu beanspruchen. ',
                    'Toast.You Can Claim Activity Points': 'Du kannst Aktivitätspunkte beanspruchen',
                    'Toast.Activity points can be claimed': 'Du kannst jetzt deine neuen Aktivitätspunkte beanspruchen. Um die Ausbeute zu steigern, ist es am besten, die Punkte jeden Tag zu beanspruchen. Dafür trägt man den Punkte-Gegenstand auf eine Seite, klickt darauf und holt die Punkte.',
                    'Toast.NotDerezzed': 'Von der Seite nehmen fehlgeschlagen',
                    'Toast.NotYourItem': 'Das ist nicht dein Gegenstand.',
                    'Toast.BadgeNotEnabled': 'Sticker aktivieren fehlgeschlagen',
                    'Toast.TooManyBadgesEnabled': 'Du hast bereits die maximale Anzahl an Stickern aktiviert.',
                    'Toast.FallenBackToOldNickBecauseServerIgbnoredPresenceTitle': 'Neuer Name nicht akzeptiert',
                    'Toast.FallenBackToOldNickBecauseServerIgbnoredPresenceText': 'Der Server mag deinen neuen Namen nicht. Bitte wähle einen anderen Namen.',
                    'Toast.Open settings': 'Einstellungen öffnen',

                    'Activity.TotalPoints': 'Alle Aktivitätspunkte',
                    'Activity.PointsChannelChat': 'Chat',
                    'Activity.PointsChannelEmote': 'Emote',
                    'Activity.PointsChannelGreet': 'Grüßen',
                    'Activity.PointsChannelNavigation': 'Navigation',
                    'Activity.PointsChannelPowerup': 'Powerup',
                    'Activity.PointsChannelItemApply': 'Gegenstandsinteraktionen',
                    'Activity.PointsChannelPageOwned': 'Webseitenbesitz',
                    'Activity.PointsChannelSocial': 'Aktivität in sozialen Netzen',

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
                    'ItemPid.PointsTotal': 'Gesammelte Punkte',
                    'ItemPid.PointsCurrent': 'Auszahlbare Punkte',
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
                    'ItemPid.BadgeTitle': 'Titel',
                    'ItemPid.BadgeDescription': 'Info',
                    'ItemPid.BadgeLinkUrl': 'Link',
                    'ItemPid.BadgeLinkLabel': 'Linktext',
                    'ItemPid.BadgeIsActive': 'Angeheftet',

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
            log.info('Config.setDevTree', { tree: {...tree} });
        }
        this.devConfig = tree;
    }

    static setOnlineTree(tree: { [p: string]: unknown }): void
    {
        if (Config.get('log.all', false) || Config.get('log.startup', true)) {
            log.info('Config.setOnlineTree', { tree: {...tree} });
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
