import { Window, WindowOptions } from './Window';
import { ContentApp } from './ContentApp';
import { domHtmlElemOfHtml } from '../lib/domTools'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { Config } from '../lib/Config';
import { as } from '../lib/as';
import { Memory } from '../lib/Memory';
import { Utils } from '../lib/Utils';
import { BackgroundMessage } from '../lib/BackgroundMessage';
import { Pid } from '../lib/ItemProperties';
import { ItemPropertiesSet } from '../lib/ItemProperties';

// declare global
// {
//     interface Window
//     {
//         YT: any;
//     }
// }

interface Video
{
    title: string;
    url: string;
}

export class TutorialWindow extends Window<WindowOptions> {

    static localStorage_TutorialPopupCount_Key: string = 'client.tutorialPopupCount';
    static localStorage_LastTutorial_Key: string = 'client.lastTutorial';
    static localStorage_DontShow_Key: string = 'dontShow.Tutorial';

    private videos: Video[] = Config.get('tutorial.videos', []);
    private currentVideoIndex: number = 0;
    private videoTitle: HTMLElement;
    private videoContainer: HTMLElement;
    private dotsContainer: HTMLElement;

    constructor(app: ContentApp)
    {
        super(app);
        this.isResizable = true;
    }

    protected prepareMakeDom(): void
    {
        super.prepareMakeDom();
        this.windowCssClasses.push('n3q-tutorialwindow');
        this.titleText = this.app.translateText('TutorialWindow.Tutorial', 'Tutorial');
        this.defaultWidth = Config.get('tutorial.defaultWidth', 1040);
        this.defaultHeight = Config.get('tutorial.defaultHeight', 665);
        this.defaultBottom = Config.get('tutorial.defaultBottom', 400);
        this.defaultLeft = Config.get('tutorial.defaultLeft', 50);
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const contentElem = this.contentElem;

        const pane = domHtmlElemOfHtml('<div class="n3q-tutorialwindow-pane" data-translate="children"></script></div>');

        this.videoTitle = domHtmlElemOfHtml('<div class="n3q-tutorialwindow-video-title"></div>');
        this.videoContainer = domHtmlElemOfHtml('<div class="n3q-tutorialwindow-video-container"></div>');

        const navButtons = domHtmlElemOfHtml('<div class="n3q-tutorialwindow-nav-buttons" data-translate="children"></div>');
        const previousBtn = domHtmlElemOfHtml('<div class="n3q-button n3q-tutorialwindow-previous" title="Previous" data-translate="attr:title:TutorialWindow text:TutorialWindow">Previous</div>');

        const dontShowContainer = domHtmlElemOfHtml('<div class="n3q-tutorialwindow-dontshow-container" data-translate="children"></div>');
        const checkboxId = Utils.randomString(10);
        const dontShowCheckbox = <HTMLInputElement>domHtmlElemOfHtml(`<input class="n3q-tutorialwindow-dontshow" type="checkbox" name="checkbox" id="${checkboxId}" />`);
        const dontShowLabel = domHtmlElemOfHtml(`<label class="n3q-tutorialwindow-dontshow" for="${checkboxId}" data-translate="text:TutorialWindow">Do not show again</label>`);
        dontShowCheckbox.checked = await TutorialWindow.isDontShow();
        dontShowCheckbox.addEventListener('change', ev => { TutorialWindow.setDontShow(dontShowCheckbox.checked); });
        dontShowContainer.appendChild(dontShowCheckbox);
        dontShowContainer.appendChild(dontShowLabel);

        const filler1 = domHtmlElemOfHtml('<div class="n3q-flex-filler"></div>');

        this.dotsContainer = domHtmlElemOfHtml('<div class="n3q-tutorialwindow-dots-container"></div>');

        const filler2 = domHtmlElemOfHtml('<div class="n3q-flex-filler"></div>');

        const nextBtn = domHtmlElemOfHtml('<div class="n3q-button n3q-tutorialwindow-next" title="Next" data-translate="attr:title:TutorialWindow text:TutorialWindow">Next</div>');

        navButtons.appendChild(previousBtn);
        navButtons.appendChild(dontShowContainer);
        navButtons.appendChild(filler1);
        navButtons.appendChild(this.dotsContainer);
        navButtons.appendChild(filler2);
        navButtons.appendChild(nextBtn);

        pane.appendChild(this.videoTitle);
        pane.appendChild(this.videoContainer);
        pane.appendChild(navButtons);

        contentElem.append(pane);

        PointerEventDispatcher.protectElementsWithDefaultActions(this.app, pane);
        PointerEventDispatcher.makeOpaqueDispatcher(this.app, previousBtn).addUnmodifiedLeftClickListener(ev => { this.onPreviousClick(); });
        PointerEventDispatcher.makeOpaqueDispatcher(this.app, nextBtn).addUnmodifiedLeftClickListener(ev => { this.onNextClick(); });
        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, pane);

        this.videos.forEach((elem, index) =>
        {
            const dot = domHtmlElemOfHtml('<div class="n3q-tutorialwindow-dot" data-index="' + index + '" title="' + as.Html(elem.title) + '"></div>');
            PointerEventDispatcher.makeOpaqueDispatcher(this.app, dot).addUnmodifiedLeftClickListener(ev => { this.onDotClick(index); });
            this.dotsContainer.appendChild(dot);
        });


        this.currentVideoIndex = await TutorialWindow.getLastVideoIndex();
        if (this.currentVideoIndex < this.videos.length - 1) {
            this.currentVideoIndex++;
        }
        this.limitVideoIndex();

        this.updateVideo().then(() => {});
    }

    private limitVideoIndex(): void
    {
        if (this.currentVideoIndex >= this.videos.length) {
            this.currentVideoIndex = this.videos.length - 1;
        }
        if (this.currentVideoIndex < 0) {
            this.currentVideoIndex = 0;
        }
    }

    private async updateVideo(): Promise<void>
    {
        this.videoTitle.textContent = this.videos[this.currentVideoIndex].title;

        const videoUrl = this.videos[this.currentVideoIndex].url.replace('youtu.be', 'youtube.com/embed') + Config.get('tutorial.videoArgs', '?autoplay=1&controls=1&fs=0&iv_load_policy=3&showinfo=0&rel=0&cc_load_policy=1')
        const videoHtmlAllow = Config.get('tutorial.videoHtmlAllow', 'allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen')
        this.videoContainer.innerHTML = `<iframe src="${videoUrl}" frameborder="0" ${videoHtmlAllow}></iframe>`;

        this.videos.forEach((elem, index) =>
        {
            const dot = this.dotsContainer.querySelector('[data-index="' + index + '"]');
            if (index == this.currentVideoIndex) {
                dot.classList.add('n3q-active');
            } else {
                dot.classList.remove('n3q-active');
            }
        });

        await TutorialWindow.saveLastVideoIndex(this.currentVideoIndex);
    }
    // private updateVideo(): void
    // {
    //     this.videoTitle.textContent = this.videos[this.currentVideoIndex].title;
    //     this.videoContainer.innerHTML = `<div id="player"></div>`;

    //     this.videos.forEach((elem, index) =>
    //     {
    //         const dot = this.dotsContainer.querySelector('[data-index="' + index + '"]');
    //         if (index == this.currentVideoIndex) {
    //             dot.classList.add('n3q-active');
    //         } else {
    //             dot.classList.remove('n3q-active');
    //         }
    //     });

    //     // Load the YouTube player API script
    //     const script = document.createElement('script');
    //     script.src = 'https://www.youtube.com/player_api';
    //     this.videoContainer.appendChild(script);

    //     // Initialize the player when the API script has finished loading
    //     script.onload = () =>
    //     {
    //         const player = new YT.Player('player', {
    //             videoId: this.videos[this.currentVideoIndex].url.split('/').pop(),
    //             playerVars: {
    //                 autoplay: 1,
    //                 controls: 1,
    //                 disablekb: 1,
    //                 enablejsapi: 1,
    //                 modestbranding: 1,
    //                 rel: 0,
    //                 showinfo: 0
    //             },
    //             events: {
    //                 'onStateChange': (event: YT.OnStateChangeEvent) =>
    //                 {
    //                     if (event.data == YT.PlayerState.ENDED) {
    //                         setTimeout(() =>
    //                         {
    //                             if (this.currentVideoIndex < this.videos.length - 1) {
    //                                 this.currentVideoIndex++;
    //                                 this.updateVideo();
    //                             }
    //                         }, 3000);
    //                     }
    //                 }
    //             }
    //         });
    //     };
    // }

    private onPreviousClick(): void
    {
        if (this.currentVideoIndex > 0) {
            this.currentVideoIndex--;
            this.updateVideo().then(_ => {});
        }
    }

    private onNextClick(): void
    {
        if (this.currentVideoIndex < this.videos.length - 1) {
            this.currentVideoIndex++;
            this.updateVideo().then(_ => {});
        }
    }

    private onDotClick(index: number): void
    {
        this.currentVideoIndex = index;
        this.updateVideo().then(_ => {});
    }

    static async getLastVideoIndex(): Promise<number>
    {
        return await Memory.getLocal(TutorialWindow.localStorage_LastTutorial_Key, -1);
    }

    static async saveLastVideoIndex(value: number): Promise<void>
    {
        await Memory.setLocal(TutorialWindow.localStorage_LastTutorial_Key, value);
    }

    static async isDontShow(): Promise<boolean>
    {
        return await Memory.getLocal(TutorialWindow.localStorage_DontShow_Key, false);
    }

    static async setDontShow(value: boolean): Promise<void>
    {
        await Memory.setLocal(TutorialWindow.localStorage_DontShow_Key, value);
    }

    static getHighestPointsTotal(pointsItemProperties: ItemPropertiesSet): number
    {
        let highestPoints = 0;
        for (let id in pointsItemProperties) {
            let props = pointsItemProperties[id];
            let points = as.Int(props[Pid.PointsTotal]);
            if (points > highestPoints) {
                highestPoints = points;
            }
        }
        return highestPoints;
    }

    static async getPointsItems(): Promise<ItemPropertiesSet>
    {
        return await BackgroundMessage.findBackpackItemProperties({ [Pid.PointsAspect]: 'true' });
    }

    static async isExperiencedUser(): Promise<boolean>
    { 
        let pointsItemProperties = await TutorialWindow.getPointsItems();
        let points = TutorialWindow.getHighestPointsTotal(pointsItemProperties);
        let experiencedUserPointsLimit = Config.get('tutorial.experiencedUserPointsLimit', 200);
        return points > experiencedUserPointsLimit;
    }
}
