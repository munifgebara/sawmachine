import { Component, OnInit } from "@angular/core";
import { MachineService } from "../machine.service";
import { Router, RouterStateSnapshot, ActivatedRoute } from "@angular/router";

import { Part } from "../domain/part";
import { Instruction } from "../domain/instruction";
import { PARAMETERS } from "@angular/core/src/util/decorators";
import { Jsonp } from "@angular/http";

@Component({
  selector: "app-simulator",
  templateUrl: "./simulator.component.html",
  styleUrls: ["./simulator.component.css"]
})
export class SimulatorComponent implements OnInit {
  private log: string[] = [];
  private phase = 0;
  private defaultSpace = 50;
  private sawThickness = 3.8;
  private minimumDimension = 10;
  private defaultColor = "#abcdff";
  private defaultSpeed = 20;
  private parts: Part[] = [];
  private workPartsStack: Part[] = [];
  private pI = 0;
  private pJ = 0;
  private stopAtCut = 0;
  private sawY = 0;
  private solution: any;
  private resume: any;
  private productionLine: any;
  private cuts: any[];
  private message = "Simulador";
  private mapLayoutParts = {};
  private iCut: number = 0;
  private partsReadySpace = 0;
  private partsReadyList = [];
  private urgentInstruction: Instruction;
  private currentInstruction: Instruction;
  private instructionStack: Instruction[] = [];
  private automatic: boolean = false;
  private quick: boolean = false;
  private expectedParts = [];

  constructor(
    private service: MachineService,
    private activatedRoute: ActivatedRoute
  ) {
    this.activatedRoute.queryParams.subscribe(params => {
      this.pI = params["i"] || 0;
      this.pJ = params["j"] || 0;
      this.stopAtCut = params["stopAtCut"] || 10000;
      this.quick = params["quick"] || false;
      console.log(this.quick);
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

  addMessage(m: string, important = false) {
    if (this.iCut >= this.stopAtCut || important) {
      this.message = `Corte:${this.iCut}:${m}`;
      this.log.push(this.message);
      console.log(this.message);
    }
  }

  initState() {
    this.parts = [];
    let i = this.pI;
    let j = this.pJ;
    this.addMessage(`Iniciando layout ${i} ${j}`);

    let plan = this.solution.plans[i];
    let layout = plan.layouts[j];
    let board = layout.board;
    this.cuts = layout.cuts;
    this.sawThickness = this.productionLine.sawMachine.sawThickness;

    layout.parts.forEach(p => {
      let pp = {
        w: p.part.c,
        h: p.part.l,
        r: p.part.rotate,
        x: p.origin.x,
        y: p.origin.y,
        id: `P${p.part.id}`
      };
      if (pp.r) {
        let aux = pp.h;
        pp.h = pp.w;
        pp.w = aux;
      }
      this.mapLayoutParts[`P${p.part.id}`] = pp;
      this.expectedParts.push({ ...pp, free: true });
    });

    this.iCut = 0;
    let firstPart: Part = {
      id: "0",
      x: 0,
      y: -700,
      w: board.width,
      h: board.height,
      ox: board.startX,
      oy: board.startY,
      info: "Board",
      color: "#ffff00",
      rotation: 0,
      scale: 1,
      sobra: false
    };

    this.parts.push(firstPart);
    let firstCut = this.cuts[this.iCut];
    this.pushNextCutInstruction(firstPart);
    this.auto();
  }

  alertaParte() {
    this.parts.forEach(p => {
      if (p.w < 0 || p.h < 0 || p.ox < 0 || p.oy < 0) {
        console.log(p.info);
        this.stop();
        throw `ERRO DE PARTE!!! ${JSON.stringify(p)} `;
      }
    });
  }

  sawCut() {
    let part = this.currentInstruction.part;
    let cut = this.cuts[this.iCut - 1];
    let nextCut = this.cuts[this.iCut];
    let data = cut.data;
    let cutType = !cut.data ? "W" : cut.data.isCleaningCut ? "C" : "P";
    this.phase = cut.phase;
    if (
      !(
        part.y + 0.1 >= this.sawY - this.sawThickness &&
        part.y - part.h <= this.sawY + this.sawThickness + 0.1
      )
    ) {
      this.addMessage(
        `A parte ${part.info} não está na serra  ${JSON.stringify(part)}`
      );
    } else if (data && data.isCleaningCut) {
      this.addMessage(`Cleaning cut ${this.iCut}`);
      let cutSize = part.y;
      part.h = part.h - cutSize - this.sawThickness;
      part.ox = part.ox;
      this.pushNextCutInstruction(part);
      this.alertaParte();
    } else if (!data) {
      this.addMessage(`Cut Work Part ${this.iCut}`);
      this.cutWorkPart(part, false);
    } else if (data && data.partNumber) {
      this.addMessage(`Cut Part ${this.iCut}`);
      this.cutWorkPart(part, true);
    }
  }

  info2(part) {
    let p = this.mapLayoutParts[part.id];
    let dh = this.r100(part.h - p.h);
    let dw = this.r100(part.w - p.w);

    let problemas = Math.abs(dh) > 0 || Math.abs(dw) > 0;
    if (problemas) {
      return ` Original ${p.w}x${p.h}x${
        p.r ? "R" : ""
      } dW${dw} dH${dh}  ${this.r100(p.x)}x${this.r100(p.y)} `;
    } else {
      return `OK`;
    }
  }

  info3(part) {
    // Para calcular o erro
    let p = this.mapLayoutParts[part.id];
    let dh = Math.abs(this.r100(part.h - p.h));
    let dw = Math.abs(this.r100(part.w - p.w));
    return { w: dw, h: dh };
  }

  destinationLocation(id) {
    let r = { x: 1000, y: 1000 };
    let p = this.expectedParts.find(xp => xp.id === id && xp.free);
    if (p) {
      r.x = p.x;
      r.y = p.y;
      p.free = false;
    }

    return r;
  }

  cutWorkPart(part: Part, cutToPart: boolean) {
    let partCopy = JSON.parse(JSON.stringify(part));
    let cut = this.cuts[this.iCut - 1];
    let cutAbsolutePosition = cut.x1 === cut.x2 ? cut.x1 : cut.y1;
    let cutPosition = part.y;
    let newPart: Part = {
      rotation: 0,
      x: part.x,
      y: -this.sawThickness,
      w: partCopy.w,
      h: partCopy.h - partCopy.y - this.sawThickness,
      ox: partCopy.ox,
      oy: cutAbsolutePosition, /// ACHO QUE é partCopy.oy
      scale: 1,
      sobra: false,
      info: `WorkPart ${cut.number}/${cut.phase}`,
      id: `P0`,
      color: this.defaultColor
    };
    part.h = partCopy.y;
    part.oy = cutAbsolutePosition; // Aí aqui tem quer partCopy.oy

    if (newPart.h > this.minimumDimension) {
      this.parts.push(newPart);
      this.workPartsStack.push(newPart);
    } else {
      this.addMessage(`${newPart.info} não tem o tamanho mínimp `);
      newPart = undefined;
    }
    if (cutToPart) {
      this.partsReadyList.push(part);
      this.adjustPhase(newPart);
      part.info = `Part ${cut.data.partNumber} (${cut.number}/${cut.phase})`;
      part.id = `P${cut.data.partNumber}`;

      if (this.phase % 2 == 1) {
        part.info = "G --->  " + part.info;
        part.w -= this.sawThickness; ////////////////////////////////////////////////////////// !!!!!! GAMBi
      }
      let playout = this.mapLayoutParts[part.id]; // PARA TENTAR MONTAR O LAYOUT ORIGINAL
      let dt = this.destinationLocation(part.id);
      if (this.phase % 2 == 0) {
        this.turnPart90(part);
      }
      this.instructionStack.push({
        part: part,
        attribute: "y",
        targetValue: 3200 + dt.y + part.h,
        cut: undefined,
        speed: this.defaultSpeed,
        done: false
      });
      this.instructionStack.push({
        part: part,
        attribute: "x",
        targetValue: dt.x,
        cut: undefined,
        speed: this.defaultSpeed,
        done: false
      });
    } else {
      this.adjustPhase(part);
      this.instructionStack.push({
        part: part,
        attribute: "y",
        targetValue: 0,
        cut: undefined,
        speed: this.defaultSpeed,
        done: false
      });
      if (newPart)
        this.instructionStack.push({
          part: newPart,
          attribute: "x",
          targetValue: newPart.w + this.defaultSpace,
          cut: undefined,
          speed: this.defaultSpeed,
          done: false
        });
    }

    this.alertaParte();
  }

  adjustPhase(part: Part): any {
    if (this.iCut >= this.cuts.length) {
      return;
    }

    let currentCut = this.cuts[this.iCut - 1];
    let nextCut = this.cuts[this.iCut];
    let deltaPhase = nextCut.phase - currentCut.phase;

    if (deltaPhase > 0) {
      this.addMessage(
        `Mudando de fase da ${currentCut.phase} ===> ${nextCut.phase}`,
        true
      );
      this.turnPart90(part);
      this.pushNextCutInstruction(part);
    } else if (deltaPhase < 0) {
      this.addMessage(
        `Corte ${this.iCut} Mudando de fase da ${currentCut.phase} ===> ${
          nextCut.phase
        }`,
        true
      );
      part.info += "(Sobra)";
      part.sobra = true;

      this.defaultSpace += part.h + 100;

      this.setUrgenturgentInstruction({
        part: part,
        attribute: "y",
        targetValue: this.defaultSpace,
        cut: undefined,
        speed: 5 * this.defaultSpeed,
        done: false
      });
      this.setUrgenturgentInstruction({
        part: part,
        attribute: "x",
        targetValue: 3100,
        cut: undefined,
        speed: 5 * this.defaultSpeed,
        done: false
      });

      let oldWorkPart = this.workPartsStack.pop();
      while (
        oldWorkPart &&
        //oldWorkPart.sobra &&
        oldWorkPart.info.indexOf(`/${nextCut.phase}`) == -1
      ) {
        // Muito perigo
        //this.addMessage(" Proxima parte  da pilha " + oldWorkPart.info);
        oldWorkPart = this.workPartsStack.pop();
        this.addMessage(
          " Proxima parte  da pilha " +
            oldWorkPart.info +
            ` ${oldWorkPart.info.indexOf(`/${nextCut.phase}`)}`,
          true
        );
      }

      this.pushNextCutInstruction(oldWorkPart);
    } else {
      this.pushNextCutInstruction(part);
    }
    this.alertaParte();
  }

  pushNextCutInstruction(part: Part): any {
    if (this.iCut < this.cuts.length) {
      let cut = this.cuts[this.iCut];
      this.iCut++;
      let itr: Instruction = {
        part: part,
        attribute: "y",
        targetValue: (cut.x1 === cut.x2 ? cut.x1 : cut.y1) - part.oy,
        cut: cut,
        speed: this.defaultSpeed,
        done: false
      };

      let otv = itr.targetValue;

      //this.addMessage(`--------  ${this.phase} ${cut.phase}--------->${itr.targetValue}  w:${part.w} h:${part.h} ox:${part.ox} oy:${part.oy}  x:${part.x} y:${part.y}  F:${cut.phase}  ${cut.data ? JSON.stringify(cut.data) : ''}`, true);

      if (cut.phase == 4 && otv < 0) {
        itr.targetValue = part.h + itr.targetValue - this.sawThickness;
        this.addMessage(`Correção 4  ${otv} ==> ${itr.targetValue}`, true);
      }
      if (cut.phase == 3 && otv < 0) {
        itr.targetValue = part.h + itr.targetValue;
        this.addMessage(`Correção 3  ${otv} ==> ${itr.targetValue}`, true);
      }
      this.instructionStack.push(itr);

      if (part.x > 0) {
        this.instructionStack.push({
          part: part,
          attribute: "x",
          targetValue: 0,
          cut: undefined,
          speed: this.defaultSpeed,
          done: false
        });
      }
    }
  }

  tansform(part: Part) {
    return `rotate(${part.rotation} ${part.x} ${part.y}) translate (${part.x} ${
      part.y
    }) scale(${part.scale} ${-part.scale}) translate (${-part.x} ${-part.y})`;
  }
  tansform2(part: Part) {
    return `translate (80 0)   translate (${part.x} ${
      part.y
    }) scale(${1} ${-1}) translate (${-part.x} ${-part.y}) rotate(${
      part.h > part.w ? -90 : 0
    } ${part.x} ${part.y})
     
    `;
  }

  r100(n) {
    return Math.round(n * 100) / 100;
  }

  interval;
  auto() {
    if (!this.automatic) {
      this.automatic = true;
      this.interval = setInterval(() => {
        this.tick(this.quick);
      }, 5);
    }
  }

  stop() {
    this.automatic = false;
    clearInterval(this.interval);
  }

  tick1000() {
    for (let i = 0; i < 1000; i++) {
      this.tick();
    }
  }

  setUrgenturgentInstruction(ui: Instruction) {
    if (this.urgentInstruction && !this.urgentInstruction.done) {
      this.urgentInstruction.part[
        this.urgentInstruction.attribute
      ] = this.urgentInstruction.targetValue;
      this.urgentInstruction.done = true;
    }
    this.urgentInstruction = ui;
  }

  distance: number;
  ticks = 0;

  tick(manual = false) {
    this.ticks++;

    if (this.urgentInstruction && !this.urgentInstruction.done && !manual) {
      this.normalEvolute(this.urgentInstruction);
      this.urgentInstruction.done =
        this.calculateDistance(this.urgentInstruction) <=
        Math.abs(this.urgentInstruction.speed);
      if (this.urgentInstruction.done) {
        this.urgentInstruction.part[
          this.urgentInstruction.attribute
        ] = this.urgentInstruction.targetValue;
      }
    } else if (!this.currentInstruction || this.currentInstruction.done) {
      if (this.instructionStack.length > 0) {
        this.currentInstruction = this.instructionStack.pop();
      } else {
        this.stop();
        this.addMessage("FIM  ");
        this.workPartsStack.forEach(wp =>
          console.log(JSON.stringify(wp.sobra))
        );

        this.partsReadyList.sort((a, b) => (a > b ? 1 : -1));
        this.partsReadyList.forEach(part => {
          console.log(
            ` ${part.info} cords:${part.x}x${part.y} calc:${this.r100(
              part.w
            )}x${this.r100(part.h)} ${this.info2(part)}  `
          );
        });
        console.log(
          `Erro H ${this.partsReadyList.reduce(
            (s, p) => s + this.info3(p).h,
            0
          )}`
        );
        console.log(
          `Erro W ${this.partsReadyList.reduce(
            (s, p) => s + this.info3(p).w,
            0
          )}`
        );
        console.log(
          `Erro Total ${this.partsReadyList.reduce(
            (s, p) => s + this.info3(p).w + this.info3(p).h,
            0
          )}`
        );
        console.log(this.partsReadyList.length);
      }
    } else {
      if (
        this.calculateDistance(this.currentInstruction) >=
          Math.abs(this.currentInstruction.speed) &&
        !manual
      ) {
        if (manual) {
          this.quickEvolute(this.currentInstruction);
        } else {
          this.normalEvolute(this.currentInstruction);
        }
      } else {
        //goal
        if (this.automatic && this.iCut >= this.stopAtCut) {
          this.stop();
        }
        this.currentInstruction.part[
          this.currentInstruction.attribute
        ] = this.currentInstruction.targetValue;
        this.distance = 0;
        if (this.currentInstruction.cut) {
          this.sawCut();
        }
        this.currentInstruction.done = true;
      }
    }
    this.alertaParte();
  }

  private calculateDistance(instruction: Instruction) {
    return Math.abs(
      instruction.part[instruction.attribute] - instruction.targetValue
    );
  }

  private normalEvolute(instruction: Instruction) {
    if (instruction.part[instruction.attribute] < instruction.targetValue) {
      instruction.part[instruction.attribute] += instruction.speed;
    } else if (
      instruction.part[instruction.attribute] > instruction.targetValue
    ) {
      instruction.part[instruction.attribute] -= instruction.speed;
    }
  }

  private quickEvolute(instruction: Instruction) {
    if (instruction.part[instruction.attribute] < instruction.targetValue) {
      instruction.part[instruction.attribute] += this.distance / 2;
    } else if (
      instruction.part[instruction.attribute] > instruction.targetValue
    ) {
      instruction.part[instruction.attribute] -= this.distance / 2;
    }
  }

  areaTotal() {
    return this.parts.reduce((s, p) => s + p.h * p.w, 0);
  }

  turnPart90(part) {
    [part.w, part.h, part.ox, part.oy] = [part.h, part.w, part.oy, part.ox];
    part.y = part.h;
    let vi = part.rotation;
    // part.rotation = -90;
    // this.setUrgenturgentInstruction({
    //   part: part,
    //   attribute: "rotation",
    //   cut: undefined,
    //   done: false,
    //   speed: 0.5,
    //   targetValue: 0
    // });
  }

  unTurnPart90(part) {
    [part.w, part.h, part.ox, part.oy] = [part.h, part.w, part.oy, part.ox];
    part.y = part.h + part.w;
    let vi = part.rotation;
    // part.rotation = 90;
    // this.setUrgenturgentInstruction({
    //   part: part,
    //   attribute: "rotation",
    //   cut: undefined,
    //   done: false,
    //   speed: 0.5,
    //   targetValue: 0
    // });
  }

  loglog(...objs) {
    objs.forEach((obj, i) => {
      console.log(i, JSON.stringify(obj));
    });
  }

  corrigeNaMarra(part) {
    let playout = this.mapLayoutParts[`${part.id}`];
    if (Math.abs(this.r100(playout.w - part.w)) > 0) {
      this.addMessage(
        `corrigindo W de ${part.info}  ${part.w} ${playout.w}  `,
        true
      );
      part.w = playout.w;
    }
    if (Math.abs(this.r100(playout.h - part.h)) > 0) {
      this.addMessage(
        `corrigindo H de ${part.info}  ${part.h} ${playout.h}  `,
        true
      );
      part.h = playout.h;
    }
  }
}
