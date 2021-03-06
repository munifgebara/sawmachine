
import { Component, OnInit } from '@angular/core';
import { MachineService } from '../machine.service';
import { TagContentType } from '@angular/compiler';
import { Jsonp } from '@angular/http';
import { Router, RouterStateSnapshot, ActivatedRoute } from '@angular/router';


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
  velocidade = 10;
  velocidadeJustMove = 10;
  deslocamento = "none";
  messages = ["Carregando"];
  iCut = 0;
  layoutParts = [];
  mapLayoutParts = {};
  cuts = [];
  parts = [];
  workParts = [];
  readyParts = [];
  sobrasParts = [];

  solution;
  resume;
  productionLine;
  workSpaceEnd = 3200 - 10; //Posição incial das peças de trabalho
  partsBegin = 100; //Posição incial das peças prontas
  sobrasBegin = 3200 + 10;

  nextInstructions = [];
  oldInstructions = [];
  pausa = 0;
  currentInstruction = {
    part: { x: 0, y: 0, w: 0, h: 0, ox: 0, oy: 0, info: "" },
    attribute: "y", target: 0, velocidade: 0, done: true, distance: 0,
    cut: undefined
  };
  interval;

  pI = 0;
  pJ = 0;


  constructor(private service: MachineService, private activatedRoute: ActivatedRoute) {
    this.activatedRoute.queryParams.subscribe(params => {
      this.pI = params['i'] | 0;
      this.pJ = params['j'] | 0;
      console.log(this.pI, this.pJ); // Print the parameter to the console. 
    });
  }
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
    let i = this.pI;
    let j = this.pJ;

    for (let a = 0; a < this.solution.plans.length; a++) {
      let plan = this.solution.plans[a];
      for (let b = 0; b < plan.layouts.length; b++) {
        console.log(`<a href="http://localhost:4200?i=${a}&j=${b}">L${a * 10 + b}</a>`);

      }

    }

    this.messages.push(`Iniciando layout ${i} ${j}`);
    let plan = this.solution.plans[i];
    let layout = plan.layouts[j];
    let board = layout.board;
    this.cuts = layout.cuts;
    this.layoutParts = layout.parts;
    this.layoutParts.forEach(p => {
      this.mapLayoutParts[`P${p.part.id}`] = { w: p.part.c, h: p.part.l, r: p.part.rotate };
    });

    this.iCut = -1;
    let firstPart = { x: 0, y: -200, w: board.width, h: board.height, ox: 0, oy: 0, info: "Board" };
    this.parts.push(firstPart);
    let firstCut = this.cuts[this.iCut + 1];
    this.pushNextCutInstruction(firstPart, firstCut);

    this.auto();

  }

  auto() {
    this.pausa = 10;
    this.interval = setInterval(() => this.tick(), 50);
  }

  stop() {
    clearInterval(this.interval);
  }
  tick10() {
    for (let i = 0; i < 1000; i++) {
      this.tick();
    }
  }

  tick(manual = false) {
    this.ticks++;
    if (this.currentInstruction.done) {
      if (this.nextInstructions.length > 0) {
        this.currentInstruction = this.nextInstructions.pop();
        if (this.currentInstruction.cut && this.currentInstruction.cut.number === 7) {
          console.log(JSON.stringify(this.currentInstruction.cut));
          console.log(JSON.stringify(this.currentInstruction.part));
          console.log(JSON.stringify(this.currentInstruction.attribute));
          console.log(JSON.stringify(this.currentInstruction.target));
        }
      }
      else {
        console.info("END");
        clearInterval(this.interval);
        this.readyParts.sort((a, b) => a.info > b.info ? 1 : -1);
      }

    }
    else {
      this.currentInstruction.distance = Math.abs(this.currentInstruction.part[this.currentInstruction.attribute] - this.currentInstruction.target);
      if (this.currentInstruction.distance >= Math.abs(this.currentInstruction.velocidade)) {

        // if (this.currentInstruction.part[this.currentInstruction.attribute] < this.currentInstruction.target) {
        //   this.currentInstruction.part[this.currentInstruction.attribute] += this.currentInstruction.velocidade;
        // }
        // else {
        //   this.currentInstruction.part[this.currentInstruction.attribute] -= this.currentInstruction.velocidade;
        // }
        if (this.currentInstruction.part[this.currentInstruction.attribute] < this.currentInstruction.target) {
          this.currentInstruction.part[this.currentInstruction.attribute] += this.currentInstruction.distance / 2;
        }
        else {
          this.currentInstruction.part[this.currentInstruction.attribute] -= this.currentInstruction.distance / 2;
        }


      }
      else {

        this.currentInstruction.part[this.currentInstruction.attribute] = this.currentInstruction.target;
        this.currentInstruction.distance = Math.abs(this.currentInstruction.part[this.currentInstruction.attribute] - this.currentInstruction.target);
        if (this.currentInstruction.cut) {
          this.cutHere();

        }
        this.currentInstruction.done = true;

        if (this.currentInstruction.cut) {
          //clearInterval(this.interval);
        }

      }

    }

  }

  areaTotal() {
    return this.parts.reduce((s, p) => s + p.h * p.w, 0);

  }

  turnPart90(part) {
    [part.w, part.h, part.ox, part.oy] = [part.h, part.w, part.oy, part.ox];
    part.y = part.h;
  }
  unTurnPart90(part) {
    [part.w, part.h, part.ox, part.oy] = [part.h, part.w, part.oy, part.ox];
    part.y = part.h;
  }


  cutHere() {
    let part = this.currentInstruction.part;
    let cut = this.currentInstruction.cut;
    let nextCut = this.cuts[this.iCut + 1];
    let data = cut.data;
    let partBeforeCut = JSON.parse(JSON.stringify(part));
    let cutType = (!cut.data) ? 'W' : (cut.data.isCleaningCut) ? "C" : "P";


    if (data && data.isCleaningCut) {
      part.h -= part.y;
      part.ox = part.ox;
      part.oy = part.y;
      this.pushNextCutInstruction(part, nextCut);
    }
    if (!data) {
      this.cutWorkPart(part, partBeforeCut, cut, nextCut, false);

    }

    else if (data && data.partNumber) {
      this.cutWorkPart(part, partBeforeCut, cut, nextCut, true);
    }

  }

  loglog(...objs) {
    objs.forEach((obj, i) => {
      console.log(i, JSON.stringify(obj));
    })
  }


  cutWorkPart(part, partBeforeCut, cut, nextCut, ready) {

    console.log(JSON.stringify(part));


    part.oy = part.y;

    part.y = 0;



    let newPart = {
      x: part.x,
      y: this.productionLine.sawMachine.sawThickness + partBeforeCut.y,
      w: part.w,
      h: partBeforeCut.y - this.productionLine.sawMachine.sawThickness - partBeforeCut.oy,
      ox: partBeforeCut.ox,
      oy: partBeforeCut.oy,
      info: ready ? `Part ${cut.data.partNumber} (${cut.number}/${cut.phase}) ` : `Work (${cut.number}) `,
      info2: ready ? " " +
        this.mapLayoutParts[`P${cut.data.partNumber}`].w + "x" + this.mapLayoutParts[`P${cut.data.partNumber}`].h : 'X'
    };
    part.h -= newPart.h;
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
      if (dPhases > 0) {
        this.turnPart90(newPart);
        this.pushNextCutInstruction(ready ? part : newPart, nextCut);
      }
      if (dPhases < 0) {
        console.log("DF", cut.number)
        this.loglog(this.workParts);

        //this.unTurnPart90(newPart);
        //        this.sobrasParts.push(part);
        sobra = true;
        part.x = 3000 - part.w;
        part.y = this.sobrasBegin;
        this.sobrasBegin += part.h + 20;
        part.info = `Sobra (${cut.number}) ${part.info} `;
        let workPart;
        if (this.workParts.length > 0) workPart = this.workParts.pop();
        if (workPart) {
          this.pushNextCutInstruction(workPart, nextCut);
        }

      }
      if (dPhases == 0) {
        this.pushNextCutInstruction(ready ? part : newPart, nextCut);
      }

    }
    if (ready) {
      if (newPart.h > newPart.w) {
        [newPart.h, newPart.w] = [newPart.w, newPart.h];
      }
      this.nextInstructions.push({
        part: newPart,
        attribute: "x",
        target: 3300,
        cut: undefined,
        velocidade: this.velocidadeJustMove,
        done: false,
        distance: part.h

      });

      this.nextInstructions.push({
        part: newPart,
        attribute: "y",
        target: this.partsBegin + newPart.h,
        cut: undefined,
        velocidade: this.velocidadeJustMove,
        done: false,
        distance: part.h
      });


      this.partsBegin += newPart.h + 30;
    }
    else {
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



  pushNextCutInstruction(part, cut, origem = 0) {
    this.iCut++;
    if (this.iCut < this.cuts.length) {
      let ni = {
        part: part,
        attribute: "y",
        target: cut.phase % 2 === 1 ? cut.y2 - origem : cut.x2 - origem,
        cut: cut,
        velocidade: this.velocidade,
        done: false,
        distance: 200,
      };
      this.nextInstructions.push(ni);
      this.nextInstructions = this.nextInstructions.slice();

      if (part.x > 0) {
        this.nextInstructions.push(
          {
            part: part,
            attribute: "x",
            target: 0,

            cut: undefined,
            velocidade: this.velocidadeJustMove,
            done: false,
            distance: 200,
          }

        );
      }
    }

  }


}



