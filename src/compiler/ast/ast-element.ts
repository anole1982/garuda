import {AstAttribute} from "./ast-attribute";

export class AstElement {
    private tag:string;
    private attrs: Array<AstAttribute>;
    private parent: AstElement;
    private children:AstElement[];
    private attrsList:Array<AstAttribute>;
    private attrsMap:{[key:string]:string};
    constructor(tag:string,attrs: Array<AstAttribute>,parent?: AstElement){

    }
}