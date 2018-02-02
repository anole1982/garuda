import {Logger} from "../logger/logger";

export interface CompilerOptions {
    logger:Logger;
    expectHTML:boolean;
    shouldKeepComment:boolean;
    isUnaryTag?:Function;
    canBeLeftOpenTag?:Function;
    start:Function;
    end:Function;
}