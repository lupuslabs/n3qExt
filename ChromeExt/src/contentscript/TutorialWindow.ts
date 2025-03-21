import { FullWindow, FullWindowOptions } from './FullWindow';
import { ContentApp } from './ContentApp';
import { DomUtils } from '../lib/DomUtils'
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

export class TutorialWindow extends FullWindow<FullWindowOptions> {

    static localStorage_TutorialPopupCount_Key: string = 'client.tutorialPopupCount';
    static localStorage_LastTutorial_Key: string = 'client.lastTutorial';
    static localStorage_DontShow_Key: string = 'dontShow.Tutorial';

    private videos: Video[] = Config.get('tutorial.videos', []);
    private currentVideoIndex: number = 0;
    private videoTitleElem: HTMLElement;
    private videoContainer: HTMLElement;
    private dotsContainer: HTMLElement;

    public constructor(app: ContentApp)
    {
        super(app);
        this.windowCssClasses.push('tutorialwindow');
        this.titleText = 'Tutorial';
        this.titleTextId = 'TutorialWindow.Tutorial';
        this.defaultWidth = Config.get('tutorial.defaultWidth', 1040);
        this.defaultHeight = Config.get('tutorial.defaultHeight', 665);
        this.defaultBottom = Config.get('tutorial.defaultBottom', 400);
        this.defaultLeft = Config.get('tutorial.defaultLeft', 50);
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();

        this.videoTitleElem = DomUtils.elemOfHtml('<div class="tutorialwindow-video-title"></div>');
        this.contentElem.appendChild(this.videoTitleElem);

        this.videoContainer = DomUtils.elemOfHtml('<div class="video-container"></div>');
        this.contentElem.appendChild(this.videoContainer);

        const navButtons = DomUtils.elemOfHtml('<div class="navigation-row" data-translate="children"></div>');

        const previousBtn = this.app.uiHelper.makeDefaultTextButton('style-big previous-button', `TutorialWindow.Previous`, 'Previous', () => this.onPreviousClick())
        navButtons.appendChild(previousBtn);

        const dontShowContainer = DomUtils.elemOfHtml('<div class="dontshow-container" data-translate="children"></div>');
        const checkboxId = DomUtils.makeUniqueElemId();
        const dontShowCheckbox = <HTMLInputElement>DomUtils.elemOfHtml(`<input type="checkbox" id="${checkboxId}" />`);
        dontShowCheckbox.checked = await TutorialWindow.isDontShow();
        dontShowCheckbox.addEventListener('change', ev => { TutorialWindow.setDontShow(dontShowCheckbox.checked); });
        dontShowContainer.appendChild(dontShowCheckbox);
        dontShowContainer.appendChild(DomUtils.elemOfHtml(`<label class="label" for="${checkboxId}" data-translate="text:TutorialWindow">Do not show again</label>`));
        navButtons.appendChild(dontShowContainer);

        this.dotsContainer = DomUtils.elemOfHtml('<div class="dots-container"></div>');
        this.videos.forEach((elem, index) => {
            const dot = DomUtils.elemOfHtml('<div class="dot" data-index="' + index + '" title="' + as.Html(elem.title) + '"></div>');
            PointerEventDispatcher.makeOpaqueDispatcher(this.app, dot).addUnmodifiedLeftClickListener(ev => { this.onDotClick(index); });
            this.dotsContainer.appendChild(dot);
        });
        navButtons.appendChild(this.dotsContainer);

        const nextBtn = this.app.uiHelper.makeDefaultTextButton('style-big next-button', `TutorialWindow.Next`, 'Next', () => this.onNextClick())
        navButtons.appendChild(nextBtn);

        this.contentElem.appendChild(navButtons);
        PointerEventDispatcher.protectElementsWithDefaultActions(this.app, this.contentElem);

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
        this.videoTitleElem.textContent = this.videos[this.currentVideoIndex].title;

        const videoUrl = this.videos[this.currentVideoIndex].url.replace('youtu.be', 'youtube.com/embed') + Config.get('tutorial.videoArgs', '?autoplay=1&controls=1&fs=0&iv_load_policy=3&showinfo=0&rel=0&cc_load_policy=1')
        const videoUrlWrapped = this.app.uiHelper.getWrappedIframeUrl(videoUrl);
        const videoHtmlAllow = Config.get('tutorial.videoHtmlAllow', 'allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen')
        this.videoContainer.innerHTML = `<iframe src="${videoUrlWrapped}" frameborder="0" ${videoHtmlAllow}></iframe>`;

        this.videos.forEach((elem, index) =>
        {
            const dot = this.dotsContainer.querySelector('[data-index="' + index + '"]');
            if (index === this.currentVideoIndex) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
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
    //             dot.classList.add('active');
    //         } else {
    //             dot.classList.remove('active');
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
        return as.Int(await Memory.getLocal(TutorialWindow.localStorage_LastTutorial_Key), -1);
    }

    static async saveLastVideoIndex(value: number): Promise<void>
    {
        await Memory.setLocal(TutorialWindow.localStorage_LastTutorial_Key, value);
    }

    static async isDontShow(): Promise<boolean>
    {
        return as.Bool(await Memory.getLocal(TutorialWindow.localStorage_DontShow_Key));
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
        if (!Utils.isBackpackEnabled()) {
            return new ItemPropertiesSet();
        }
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
