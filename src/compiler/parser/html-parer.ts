import {AstElement} from "../ast/ast-element";
import {CompilerOptions} from "../compiler-options";
import {AbstractParser} from "./abstract-parser";
import {no,makeMap,isNonPhrasingTag,canbeLeftOpenTag} from "../util";

export class HtmlParer extends AbstractParser{
    private reCache = {};
    private decodingMap = {
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&amp;': '&',
        '&#10;': '\n',
        '&#9;': '\t'
    };
    private encodedAttr = /&(?:lt|gt|quot|amp);/g;
    private encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#10|#9);/g;
    private isPlainTextElement = makeMap('script,style,textarea', true);
    private isIgnoreNewlineTag = makeMap('pre,textarea', true);
    private comment = /^<!\--/;
    private conditionalComment = /^<!\[/;
    private doctype = /^<!DOCTYPE [^>]+>/i;
    private ncname = '[a-zA-Z_][\\w\\-\\.]*';
    private qnameCapture = `((?:${this.ncname}\\:)?${this.ncname})`;
    private startTagOpen = new RegExp(`^<${this.qnameCapture}`);
    private startTagClose = /^\s*(\/?)>/;
    private endTag = new RegExp(`^<\\/${this.qnameCapture}[^>]*>`);
    // Regular Expressions for parsing tags and attributes
    private attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/;
    private index = 0;
    private last;
    private lastTag;
    private options:CompilerOptions;
    private stack = [];
    public parse(html: string, options: CompilerOptions): AstElement {
        this.last = html;
        this.options = options;
        while (this.last) {
            if (!this.lastTag || !this.isPlainTextElement(this.lastTag)) {
                // 处理非文本（例如 style script textarea）节点
                let textEnd = this.last.indexOf('<');
                if (textEnd === 0) {
                    // Comment:
                    if (this.isComment(this.last)) {
                        this.parseComment();
                        continue;
                    }
                    // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
                    if (this.isConditionalComment(this.last)) {
                        this.parseConditionalComment();
                        continue;
                    }
                    // Doctype:
                    if(this.isDoctype(this.last)){
                        this.parseDoctype();
                        continue;
                    }
                    //End tag:
                    if(this.isEndTag(this.last)){
                        this.parseEndTag();
                        continue;
                    }
                    //Start tag:
                    if(this.isStartTag(this.last)){
                        this.parseStartTag();
                        continue;
                    }
                }
                let text:string, rest:string, next:number;
                if (textEnd >= 0) {
                    rest = this.last.slice(textEnd);
                    while (
                        !this.endTag.test(rest) &&
                        !this.startTagOpen.test(rest) &&
                        !this.comment.test(rest) &&
                        !this.conditionalComment.test(rest)
                        ){
                        next = rest.indexOf('<', 1);
                        if (next < 0) break;
                        textEnd += next;
                        rest = this.last.slice(textEnd);
                    }
                    text =  this.last.substring(0, textEnd);
                    this.advance(textEnd);
                }
                if (textEnd < 0) {
                    text = this.last;
                    this.last = '';
                }
                if (this.options.chars && text) {
                    this.options.chars(text);
                }
            }else {
                let endTagLength = 0;
                const stackedTag = this.lastTag.toLowerCase();
                const reStackedTag = this.reCache[stackedTag] || (this.reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
                const rest = this.last.replace(reStackedTag, function (all, text, endTag) {
                    endTagLength = endTag.length;
                    if (!this.isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
                        text = text.replace(/<!\--([\s\S]*?)-->/g, '$1')
                                   .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1');
                    }
                    if (this.options.shouldIgnoreFirstNewline(stackedTag, text)) {
                        text = text.slice(1);
                    }
                    if (this.options.chars) {
                        this.options.chars(text);
                    }
                    return '';
                });
                this.index += this.last.length - rest.length;
                this.last = rest;
                this.endTagHandler(stackedTag, this.index - endTagLength, this.index);
            }
            if (html === this.last) {
                this.options.chars && this.options.chars(html);
                if (!this.stack.length) {
                    this.options.logger.warn(`Mal-formatted tag at end of template: "${html}"`);
                }
                break;
            }
        }
        // Clean up any remaining tags
        this.endTagHandler();
    }
    private isComment(text:string):boolean{
        return !!this.comment.test(this.last);
    }
    private isConditionalComment(text:string):boolean{
        return !!this.conditionalComment.test(this.last);
    }
    private isDoctype(text:string):boolean{
        return !!this.last.match(this.doctype);
    }
    private isEndTag(text:string):boolean {
        return !!this.last.match(this.endTag);
    }
    private isStartTag(text:string):boolean {
        return !!this.last.match(this.startTagOpen);
    }
    private parseComment(){
        const commentEnd = this.last.indexOf('-->');
        if (commentEnd >= 0) {
            if (this.options.shouldKeepComment) {
                this.commentHandler(this.last.substring(4, commentEnd));
            }
            this.advance(commentEnd + 3);
        }
    }
    private parseConditionalComment(){
        const conditionalEnd = this.last.indexOf(']>');
        if (conditionalEnd >= 0) {
            this.advance(conditionalEnd + 2);
        }
    }
    private parseDoctype(){
        const doctypeMatch = this.last.match(this.doctype);
        this.advance(doctypeMatch[0].length);
    }
    private parseEndTag(){
        const endTagMatch = this.last.match(this.endTag);
        const curIndex = this.index;
        this.advance(endTagMatch[0].length)
        this.endTagHandler(endTagMatch[1], curIndex, this.index);
    }
    private parseStartTag(){
        const start = this.last.match(this.startTagOpen);
        const match = {
            tagName: start[1],
            attrs: [],
            start: this.index,
            unarySlash:undefined,
            end:undefined
        };
        this.advance(start[0].length)
        let end, attr;
        while (!(end = this.last.match(this.startTagClose)) && (attr = this.last.match(this.attribute))) {
            this.advance(attr[0].length);
                match.attrs.push(attr)
        }
        if (end) {
            match.unarySlash = end[1];
            this.advance(end[0].length);
            match.end = this.index;
        }
        if (this.options.expectHTML) {
            if (
                (this.lastTag === 'p' && isNonPhrasingTag(match.tagName))
                ||
                (canbeLeftOpenTag(match.tagName) && this.lastTag === match.tagName)
            ) {
                this.endTagHandler(this.lastTag);
            }
        }
        if (this.shouldIgnoreFirstNewline(this.lastTag, this.last)) {
            this.advance(1);
        }
    }
    private commentHandler(text:string) {
        // currentParent.children.push({
        //     type: 3,
        //     text,
        //     isComment: true
        // });
    }
    private endTagHandler(tagName?:string,start?:number,end?:number){
        let pos, lowerCasedTagName;
        if (start == null) start = this.index;
        if (end == null) end = this.index;
        if (tagName) {
            lowerCasedTagName = tagName.toLowerCase();
        }
        // Find the closest opened tag of the same type
        if (tagName) {
            for (pos = this.stack.length - 1; pos >= 0; pos--) {
                if (this.stack[pos].lowerCasedTag === lowerCasedTagName) {
                    break;
                }
            }
        } else {
            // If no tag name is provided, clean shop
            pos = 0;
        }
        if (pos >= 0) {
            // Close all the open elements, up the stack
            for (let i = this.stack.length - 1; i >= pos; i--) {
                if (i > pos || !tagName) {
                    this.options.logger.warn( `tag <${this.stack[i].tag}> has no matching end tag.`);
                }
                if (this.options.end) {
                    this.options.end(this.stack[i].tag, start, end);
                }
            }

            // Remove the open elements from the stack
            this.stack.length = pos;
            this.lastTag = pos && this.stack[pos - 1].tag;
        } else if (lowerCasedTagName === 'br') {
            if (this.options.start) {
                this.options.start(tagName, [], true, start, end)
            }
        } else if (lowerCasedTagName === 'p') {
            if (this.options.start) {
                this.options.start(tagName, [], false, start, end)
            }
            if (this.options.end) {
                this.options.end(tagName, start, end)
            }
        }
    }
    private advance(n:number) {
        this.index += n;
        this.last = this.last.substring(n);
    }

    private shouldIgnoreFirstNewline(tag, html){
        return tag && this.isIgnoreNewlineTag(tag) && html[0] === '\n';
    }
}