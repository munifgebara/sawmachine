import { Part } from "./part";



export interface Instruction {

    part: Part;
    attribute: string;
    targetValue: number;
    speed: number;
    done: boolean;
    cut: any;


}
