import { ContentApp } from './ContentApp';

export class Sound
{
    private sound: HTMLAudioElement;

    constructor(protected app: ContentApp, protected src: any)
    {
        this.sound = document.createElement('audio');
        this.sound.src = src;
        this.sound.setAttribute('preload', 'auto');
        this.sound.setAttribute('controls', 'none');
        this.sound.style.display = 'none';
        $(this.app.getDisplay()).append(this.sound);
    }

    play(): void
    {
        this.sound.play();
    }

    stop(): void
    {
        this.sound.pause();
    }
}
