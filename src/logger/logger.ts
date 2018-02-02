export interface Logger {
    warn(message:string,params?:Array|Object);
    debug(message:string,params?:Array|Object);
    error(message:string,params?:Array|Object);
}