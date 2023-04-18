import { Window, WindowOptions } from './Window';
import { ContentApp } from './ContentApp';
import { domHtmlElemOfHtml } from '../lib/domTools'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'
import { Config } from '../lib/Config';

interface Video
{
    title: string;
    url: string;
}

export class TutorialWindow extends Window<WindowOptions> {
    // private videos: Video[] = [
    //     {
    //         title: '2750 The Interactive VR-Drama Executive Decision',
    //         url: 'https://www.youtube.com/embed/_0nVD3USvbU?autoplay=1&controls=0',
    //     },
    //     {
    //         title: '2626 An Administrative Process Saves Humanity',
    //         url: 'https://www.youtube.com/embed/mU3g6aig8N4?autoplay=1&controls=0',
    //     },
    //     {
    //         title: '2574 The Greatest Scam Ever',
    //         url: 'https://www.youtube.com/embed/SYm-j8vcCDY?autoplay=1&controls=0',
    //     },
    // ];
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
        this.defaultWidth = Config.get('tutorial.defaultWidth', 800);
        this.defaultHeight = Config.get('tutorial.defaultHeight', 600);
        this.defaultBottom = Config.get('tutorial.defaultBottom', 400);
        this.defaultLeft = Config.get('tutorial.defaultLeft', 50);
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const contentElem = this.contentElem;

        const pane = domHtmlElemOfHtml('<div class="n3q-base n3q-tutorialwindow-pane" data-translate="children"></div>');

        this.videoTitle = domHtmlElemOfHtml('<div class="n3q-tutorialwindow-video-title"></div>');
        this.videoContainer = domHtmlElemOfHtml('<div class="n3q-tutorialwindow-video-container"></div>');

        const navButtons = domHtmlElemOfHtml('<div class="n3q-tutorialwindow-nav-buttons" data-translate="children"></div>');
        const previousBtn = domHtmlElemOfHtml('<div class="n3q-button n3q-tutorialwindow-previous" title="Previous" data-translate="attr:title:TutorialWindow text:Tutorialindow">Previous</div>');
        const nextBtn = domHtmlElemOfHtml('<div class="n3q-button n3q-tutorialwindow-next" title="Next" data-translate="attr:title:TutorialWindow text:TutorialWindow">Next</div>');
        this.dotsContainer = domHtmlElemOfHtml('<div class="n3q-tutorialwindow-dots-container"></div>');

        navButtons.appendChild(previousBtn);
        navButtons.appendChild(this.dotsContainer);
        navButtons.appendChild(nextBtn);

        pane.appendChild(this.videoTitle);
        pane.appendChild(this.videoContainer);
        pane.appendChild(navButtons);

        contentElem.append(pane);

        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, pane);

        PointerEventDispatcher.makeOpaqueDispatcher(this.app, previousBtn).addUnmodifiedLeftClickListener(ev => { this.onPreviousClick(); });
        PointerEventDispatcher.makeOpaqueDispatcher(this.app, nextBtn).addUnmodifiedLeftClickListener(ev => { this.onNextClick(); });

        this.videos.forEach((elem, index) =>
        {
            const dot = domHtmlElemOfHtml('<div class="n3q-tutorialwindow-dot" data-index="' + index + '" title="' + elem.title + '"></div>');
            PointerEventDispatcher.makeOpaqueDispatcher(this.app, dot).addUnmodifiedLeftClickListener(ev => { this.onDotClick(index); });
            this.dotsContainer.appendChild(dot);
        });

        this.updateVideo();
    }

    private updateVideo(): void
    {
        this.videoTitle.textContent = this.videos[this.currentVideoIndex].title;
        this.videoContainer.innerHTML = `<iframe src="${this.videos[this.currentVideoIndex].url.replace('youtu.be', 'youtube.com/embed')}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;

        this.videos.forEach((elem, index) =>
        {
            const dot = this.dotsContainer.querySelector('[data-index="' + index + '"]');
            if (index == this.currentVideoIndex) {
                dot.classList.add('n3q-active');
            } else {
                dot.classList.remove('n3q-active');
            }
        });
    }

    private onPreviousClick(): void
    {
        if (this.currentVideoIndex > 0) {
            this.currentVideoIndex--;
            this.updateVideo();
        }
    }

    private onNextClick(): void
    {
        if (this.currentVideoIndex < this.videos.length - 1) {
            this.currentVideoIndex++;
            this.updateVideo();
        }
    }

    private onDotClick(index: number): void
    {
        this.currentVideoIndex = index;
        this.updateVideo();
    }
}
