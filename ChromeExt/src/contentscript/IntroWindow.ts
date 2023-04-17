import { Window, WindowOptions } from './Window';
import { ContentApp } from './ContentApp';
import { domHtmlElemOfHtml } from '../lib/domTools'
import { PointerEventDispatcher } from '../lib/PointerEventDispatcher'

interface Video
{
    title: string;
    url: string;
}

export class IntroWindow extends Window<WindowOptions> {
    private videos: Video[] = [
        {
            title: '2750 The Interactive VR-Drama Executive Decision',
            url: 'https://www.youtube.com/embed/_0nVD3USvbU?autoplay=&controls=01',
        },
        {
            title: '2626 An Administrative Process Saves Humanity',
            url: 'https://www.youtube.com/embed/mU3g6aig8N4?autoplay=1&controls=0',
        },
        {
            title: '2574 The Greatest Scam Ever',
            url: 'https://www.youtube.com/embed/SYm-j8vcCDY?autoplay=1&controls=0',
        },
    ];
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
        this.windowCssClasses.push('n3q-introwindow');
        this.titleText = this.app.translateText('IntroWindow.Introduction', 'Tutorial');
        this.defaultWidth = 800;
        this.defaultHeight = 600;
        this.defaultBottom = 400;
        this.defaultLeft = 50;
    }

    protected async makeContent(): Promise<void>
    {
        await super.makeContent();
        const contentElem = this.contentElem;

        const tutorialPane = domHtmlElemOfHtml('<div class="n3q-base tutorial-window" data-translate="children"></div>');

        this.videoTitle = domHtmlElemOfHtml('<h3 class="video-title"></h3>');
        this.videoContainer = domHtmlElemOfHtml('<div class="video-container"></div>');

        const navButtons = domHtmlElemOfHtml('<div class="nav-buttons" data-translate="children"></div>');
        const previousBtn = domHtmlElemOfHtml('<button class="previous-btn" data-translate="text:IntroWindow">Previous</button>');
        const nextBtn = domHtmlElemOfHtml('<button class="next-btn" data-translate="text:IntroWindow">Next</button>');
        this.dotsContainer = domHtmlElemOfHtml('<div class="dots-container"></div>');

        navButtons.appendChild(previousBtn);
        navButtons.appendChild(this.dotsContainer);
        navButtons.appendChild(nextBtn);

        tutorialPane.appendChild(this.videoTitle);
        tutorialPane.appendChild(this.videoContainer);
        tutorialPane.appendChild(navButtons);

        contentElem.append(tutorialPane);

        PointerEventDispatcher.makeOpaqueDefaultActionsDispatcher(this.app, tutorialPane);

        PointerEventDispatcher.makeOpaqueDispatcher(this.app, previousBtn).addUnmodifiedLeftClickListener(ev => { this.onPreviousClick(); });
        PointerEventDispatcher.makeOpaqueDispatcher(this.app, nextBtn).addUnmodifiedLeftClickListener(ev => { this.onNextClick(); });

        this.videos.forEach((elem, index) =>
        {
            const dot = domHtmlElemOfHtml('<span class="dot" data-index="' + index + '" title="' + elem.title + '"></span>');
            dot.addEventListener('click', () => this.onDotClick(index));
            this.dotsContainer.appendChild(dot);
            PointerEventDispatcher.makeOpaqueDispatcher(this.app, dot).addUnmodifiedLeftClickListener(ev => { this.onDotClick(index); });
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
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
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
