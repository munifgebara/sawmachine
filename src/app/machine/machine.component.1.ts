
import { Component, OnInit } from '@angular/core';
import { MachineService } from '../machine.service';
import { TagContentType } from '@angular/compiler';
import { Jsonp } from '@angular/http';



@Component({
  selector: 'app-machine',
  templateUrl: './machine.component.html',
  styleUrls: ['./machine.component.css']
})
export class MachineComponent implements OnInit {

  log = false;
  log2 = true;

  ticks = 0;
  currentBoard;
  velocidade = 50;
  velocidadeJustMove = 50;
  deslocamento = "none";
  messages = ["Carregando"];
  iCut = 0;
  cuts = [];
  parts = [];
  workParts = [];
  readyParts = [];
  sobrasParts = [];

  solution;
  resume;
  productionLine;
  workSpaceEnd = 1200 - 10; //Posição incial das peças de trabalho
  partsBegin = 1200 + 10; //Posição incial das peças prontas
  sobrasBegin = 1200 + 10; //Posição incial das peças prontas
  nextInstructions = [];
  pausa = 0;
  currentInstruction = {
    part: { x: 0, y: 0, w: 0, h: 0, ox: 0, oy: 0, info: "" },
    attribute: "y", target: 0, velocidade: 0, done: true, distance: 0,
    cut: undefined
  };
  interval;

  constructor(private service: MachineService) { }
  ngOnInit() {
    this.service.getSolution().then(s => {
      this.solution = s.solution;
      this.resume = s.resume;
      this.productionLine = this.solution.productionLine;
      this.initState();
    });
  }

  r100(n) {
    return Math.round(n * 100) / 100;
  }

  initState() {
    let i = 0;
    let j = 0;
    this.messages.push(`Iniciando layout ${i} ${j}`);
    let plan = this.solution.plans[i];
    let layout = plan.layouts[j];
    let board = layout.board;
    this.cuts = layout.cuts;
    this.iCut = 0;
    let firstPart = { x: 0, y: -200, w: board.width, h: board.height, ox: 0, oy: 0, info: "Board" };
    this.parts.push(firstPart);
    let firstCut = this.cuts[this.iCut];
    this.nextInstructions.push({
      part: firstPart,
      attribute: "y",
      target: firstCut.y2,
      cut: firstCut,
      velocidade: this.velocidade,
      done: false,
      distance: 200,
    });
    console.log("cut.number, cut.direction, cut.phase, cut.role, cut.x1, cut.x1, cut.y1, cut.y2, cutType, part.y, part.w, part.ox, part.oy, part.info");
    this.auto();
  }

  auto() {
    this.pausa = 10;
    this.interval = setInterval(() => this.tick(), 5);
  }

  stop() {
    clearInterval(this.interval);
  }
  tick10() {
    for (let i = 0; i < 10; i++) {
      this.tick();
    }
  }

  tick() {
    this.ticks++;
    if (this.currentInstruction.done) {
      if (this.nextInstructions.length > 0) {
        this.currentInstruction = this.nextInstructions.pop();
      }
      else {
        console.info("END");
        clearInterval(this.interval);
      }

    }
    else {
      this.currentInstruction.distance = Math.abs(this.currentInstruction.part[this.currentInstruction.attribute] - this.currentInstruction.target);
      if (this.currentInstruction.distance >= Math.abs(this.currentInstruction.velocidade)) {
        if (this.currentInstruction.part[this.currentInstruction.attribute] < this.currentInstruction.target) {
          this.currentInstruction.part[this.currentInstruction.attribute] += this.currentInstruction.velocidade;
        }
        else {
          this.currentInstruction.part[this.currentInstruction.attribute] -= this.currentInstruction.velocidade;
        }
      }
      else {
        this.currentInstruction.part[this.currentInstruction.attribute] = this.currentInstruction.target;
        this.currentInstruction.distance = Math.abs(this.currentInstruction.part[this.currentInstruction.attribute] - this.currentInstruction.target);
        if (this.currentInstruction.cut) {
          this.cutHere();
        }
        this.currentInstruction.done = true;
      }
    }
  }

  turnPart90(part) {
    [part.w, part.h, part.ox, part.oy] = [part.h, part.w, part.oy, part.ox];
    part.y = part.h + part.w;
  }
  unTurnPart90(part) {
    [part.w, part.h, part.ox, part.oy] = [part.h, part.w, part.oy, part.ox];
    part.y = part.h + part.w;
  }


  cutHere() {
    let part = this.currentInstruction.part;
    let cut = this.currentInstruction.cut;
    let nextCut = this.cuts[this.iCut + 1];
    let data = cut.data;
    let partBeforeCut = JSON.parse(JSON.stringify(part));
    let cutType = (!cut.data) ? 'W' : (cut.data.isCleaningCut) ? "C" : "P";
    console.log(cut.number, cutType, cut.direction, cut.phase, cut.role, cut.x1, cut.x1, cut.y1, cut.y2, part.y, part.w, part.ox, part.oy, part.info);

    if (data && data.isCleaningCut) {
      part.h -= part.y;
      part.ox = part.x;
      part.oy = part.y;
      this.pushNextCutInstruction(part, nextCut);
    }

    if (!data) {
      this.cutWorkPart(part, partBeforeCut, cut, nextCut, false);
    }

    else if (data && data.partNumber) {
      this.cutWorkPart(part, partBeforeCut, cut, nextCut, true);
    }

    console.log(cut.number, cutType, cut.direction, cut.phase, cut.role, cut.x1, cut.x1, cut.y1, cut.y2, part.y, part.w, part.ox, part.oy, part.info);
    console.log("");

  }



  cutWorkPart(part, partBeforeCut, cut, nextCut, ready) {
    part.h -= part.y;
    part.y = 0;


    let newPart = {
      x: part.x,
      y: this.productionLine.sawMachine.sawThickness + partBeforeCut.y,
      w: part.w,
      h: partBeforeCut.y - this.productionLine.sawMachine.sawThickness,
      ox: partBeforeCut.x,
      oy: partBeforeCut.y,
      info: ready ? `Part ${cut.data.partNumber} (${cut.number}/${cut.phase}) ` : `Work (${cut.number}) `
    };

    this.parts.push(newPart);


    if (ready) {
      this.readyParts.push(newPart);
    }
    else {
      this.workParts.push(part);
    }

    let sobra = false;

    if (nextCut) {
      let dPhases = nextCut.phase - cut.phase;
      if (dPhases == 1) {
        this.turnPart90(newPart);
        this.pushNextCutInstruction(ready ? part : newPart, nextCut);
      }

      if (dPhases == -1) {
        sobra = true;
        newPart.x = 2900 - newPart.w;
        newPart.y = this.sobrasBegin;
        this.sobrasBegin += 10 + newPart.h;
        newPart.info = newPart.info.replace("Work", "Sobra");

        //this.unTurnPart90(newPart);
        part = this.workParts.pop();
        this.pushNextCutInstruction(part, nextCut);
      }
      if (dPhases == 0) {
        this.pushNextCutInstruction(ready ? part : newPart, nextCut);
      }

    }
    if (ready) {

      this.nextInstructions.push({
        part: newPart,
        attribute: "y",
        target: this.partsBegin + newPart.h,
        cut: undefined,
        velocidade: this.velocidadeJustMove,
        done: false,
        distance: part.h

      });
      this.partsBegin += 10 + newPart.h;


    }
    else if (!sobra) {
      this.nextInstructions.push({
        part: newPart,
        attribute: "y",
        target: 0,
        cut: undefined,
        velocidade: this.velocidadeJustMove,
        done: false,
        distance: part.h

      });
      this.nextInstructions.push({
        part: part,
        attribute: "x",
        target: part.w,
        cut: undefined,
        velocidade: this.velocidadeJustMove,
        done: false,
        distance: part.h
      });
    }


  }



  pushNextCutInstruction(part, cut) {

    this.iCut++;
    if (this.iCut < this.cuts.length) {
      let ni = {
        part: part,
        attribute: "y",
        target: cut.phase % 2 === 1 ? cut.y2 - part.oy : cut.x2 - part.oy,
        cut: cut,
        velocidade: this.velocidade,
        done: false,
        distance: 0,
      };
      this.nextInstructions.push(ni);

      if (part.x > 0) {
        this.nextInstructions.push(
          {
            part: part,
            attribute: "x",
            target: 0,

            cut: undefined,
            velocidade: this.velocidadeJustMove,
            done: false,
            distance: 0,
          }

        );
      }
    }

  }


}
