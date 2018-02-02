import {AstElement} from "../ast/ast-element";
import {CompilerOptions} from "../compiler-options";

export interface Parser {
    parse(template: string,options: CompilerOptions):AstElement;
}