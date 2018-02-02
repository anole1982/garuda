import {Parser} from "./parser";
import {Logger} from "../../logger/logger";

export abstract class AbstractParser implements Parser {
    private warned = false;
    private logger:Logger;
    private warnOnce(message:string){
        if (!this.warned) {
            this.warned = true;
            this.logger.warn(message);
        }
    }
}