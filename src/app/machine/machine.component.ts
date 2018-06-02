import { Component, OnInit } from '@angular/core';
import { MachineService } from '../machine.service';



@Component({
  selector: 'app-machine',
  templateUrl: './machine.component.html',
  styleUrls: ['./machine.component.css']
})
export class MachineComponent implements OnInit {


  refX = 0;
  refY = 0;
  ticks = 0;
  currentBoard;
  velocidade = 10;
  deslocamento = "0";
  mensagem = "Carregando";
  parts = [];
  solution;
  resume;
  productionLine;
  space = 2990; //Posição incial das peças de trabalho
  ready = 3050; //Posição incial das peças prontas
  yShaw = 500;  //Posição da serra
  debug = "";
  cuts = [];
  nextInstructions = [];
  pausa = 0;
  iCut = 1;
  aY = this.velocidade;
  currentInstruction = { part: undefined, targetY: undefined, cut: undefined, done: undefined };
  oldInstructions = [];

  constructor(private service: MachineService) { }

  ngOnInit() {
    this.service.getSolution().then(s => {
      this.solution = s.solution;
      this.resume = s.resume;
      this.productionLine = this.solution.productionLine;
      this.iniciaCorte();
    });
  }

  turnPart(part) {
    part.y += part.h;
    [part.w, part.h] = [part.h, part.w];
  }
  unturnPart(part) {
    part.y -= part.w;
    [part.w, part.h] = [part.h, part.w];
  }


  corta() {
    let partBeforeCut = JSON.parse(JSON.stringify(this.currentInstruction));
    let deltaPhase = 0;
    let cutSize = Math.abs(this.currentInstruction.cut.direction === "horizontal" ? this.currentInstruction.cut.y1 - this.refX : this.currentInstruction.cut.x1 - this.refY) + this.productionLine.sawMachine.sawThickness;
    if (this.currentInstruction.cut.direction === "horizontal") {
      this.refY = this.currentInstruction.cut.y1;
    }
    else {
      this.refX = this.currentInstruction.cut.x1;
    }
    this.currentInstruction.part.h = this.currentInstruction.part.h - cutSize;

    let newPart = {
      x: this.currentInstruction.part.x,
      y: this.yShaw,
      w: this.currentInstruction.part.w,
      h: cutSize > 0 ? cutSize : 0.1,
      info: `Creating `,
      oX: this.refX,
      oY: this.refX
    }
    this.parts.push(newPart);

    this.iCut++;
    let nextCut;
    if (this.iCut < this.cuts.length) {
      nextCut = this.cuts[this.iCut];
      deltaPhase = nextCut.phase - this.currentInstruction.cut.phase;
      if (deltaPhase == 1) {
        this.turnPart(newPart); //Colocar animaçao girando

      }
      if (deltaPhase == -1) {
        this.unturnPart(newPart); //Colocar animaçao girando
      }
      this.nextInstructions.push({ part: this.currentInstruction.part, cut: null, targetY: this.yShaw - this.currentInstruction.part.h - newPart.h, done: false });
      this.nextInstructions.push({ part: this.currentInstruction.part, cut: null, targetY: this.yShaw - this.currentInstruction.part.h, done: false });
    }
    if (this.currentInstruction.cut.data && this.currentInstruction.cut.data.partNumber) {
      this.nextInstructions.push({ part: newPart, cut: null, targetY: this.ready, done: false });
      this.ready += (cutSize + 10);
      newPart.info = `P:${this.currentInstruction.cut.data.partNumber} C:${this.currentInstruction.cut.number}`;
    }

    else if (this.currentInstruction.cut.data && this.currentInstruction.cut.data.isCleanCut) {
      this.nextInstructions.push({ part: newPart, cut: null, targetY: this.ready, done: false });
      this.ready += 60;
      newPart.info = `CLEAN:${this.currentInstruction.cut.number}`;
    }
    else {
      this.nextInstructions.push({ part: newPart, cut: null, targetY: this.space, done: false });
      this.space = (this.space - newPart.h - 10);
      newPart.info = `WORK:${this.currentInstruction.cut.number}`;
    }
    console.log(`CORTOU NOVA ${newPart.info} CS:${cutSize} npH:${newPart.h} + ${this.currentInstruction.part} = ${partBeforeCut.h}`);
  }


  iniciaCorte() {
    //this.solution.plans.forEach(plan => {
    let i = 0;
    let j = 0;
    this.mensagem = `Iniciando layout ${i} ${j}`;
    let plan = this.solution.plans[i];
    let layout = plan.layouts[j];
    let board = layout.board;
    this.cuts = layout.cuts;
    this.refX = board.startX;
    this.refY = board.startY;

    let firstPart = { x: 0, y: this.yShaw - board.height - 500, w: board.width, h: board.height, info: "Board", oX: this.productionLine.sawMachine.widthCleaningCut, oY: this.productionLine.sawMachine.heightCleaningCut };
    this.parts.push(firstPart);

    let firstCut = this.cuts[this.iCut];

    this.nextInstructions.push({ part: firstPart, targetY: this.yShaw - board.height + firstCut.y1, cut: firstCut, done: false });//EXECUTA COMO PILHA

    this.currentInstruction = this.nextInstructions.pop();
    let interval = setInterval(() => {
      this.debug = ``;
      this.deslocamento = `Ticks:${this.ticks++} Instructions:${this.nextInstructions.length} iCut:${this.iCut} D:${Math.round(this.currentInstruction.targetY - this.currentInstruction.part.y)} T:${Math.round(this.currentInstruction.targetY * 100) / 100} Y:${Math.round(this.currentInstruction.part.y * 100) / 100}}`;
      if (this.pausa > 0) { // PAUSADO
        this.pausa--;
        this.debug = `Pausa ${this.pausa}`;
      }
      else { //Animando
        if (Math.abs(this.currentInstruction.part.y - this.currentInstruction.targetY) > Math.abs(2 * this.aY)) { //Movendo parte
          this.debug = `Animando`;
          this.currentInstruction.part.y += this.aY;
        }
        else { //Chegou
          this.debug = `Chegou`;
          this.currentInstruction.part.y = this.currentInstruction.targetY; //para remover os erros dos passos
          this.currentInstruction.done = true;
          this.oldInstructions.push(this.currentInstruction);
          if (this.currentInstruction.cut) {
            this.corta();
          }
          if (this.nextInstructions.length > 0) {
            this.currentInstruction = this.nextInstructions.pop();
            this.aY = this.currentInstruction.part.y < this.currentInstruction.targetY ? this.velocidade : -this.velocidade;
          }
        }
      }
      if (!this.currentInstruction) {
        clearInterval(interval);
        console.log("FIM DAS INTRUCOES");
        this.mensagem = "FIM DAS INTRUCOES";
        this.pausa = 1000;
      }
      if (this.iCut >= this.cuts.length && this.nextInstructions.length === 0) {// Verifica se os cortes acabaram e não tem mais instruções para fazer
        clearInterval(interval);
        console.log("FIM");
        this.mensagem = "FIM do Layout";
        this.pausa = 1000;
      }
    }, 50);
  }



}
