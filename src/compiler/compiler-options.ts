import {Logger} from "../logger/logger";

export interface CompilerOptions {
    logger:Logger;
    expectHTML:boolean;
    shouldKeepComment:boolean;
    shouldDecodeNewlinesForHref:boolean;
    shouldDecodeNewlines:boolean;
    isUnaryTag?:(key: string) => boolean;
    canBeLeftOpenTag?:(key: string) => boolean;
    start:Function;
    end:Function;
    chars:Function;
}