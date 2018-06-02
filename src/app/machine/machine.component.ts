import { Component, OnInit } from '@angular/core';
import { MachineService } from '../machine.service';



@Component({
  selector: 'app-machine',
  templateUrl: './machine.component.html',
  styleUrls: ['./machine.component.css']
})
export class MachineComponent implements OnInit {

  acaleracao = 10;

  deslocamento = "0";
  mensagem = "Carregando";
  parts = [];
  solution;
  resume;
  estadoV;
  space = 2990; //Posição incial das peças de trabalho
  ready = 3050; //Posição incial das peças prontas
  yShaw = 500;  //Posição da serra
  debug = "";

  constructor(private service: MachineService) { }

  ngOnInit() {
    this.service.getSolution().then(s => {
      this.solution = s.solution;
      this.resume = s.resume;
      this.iniciaCorte();
    });
  }

  atualizaMensagem(cut) {
    let sData = "";
    if (cut.data) {
      if (cut.data.isCleaningCut) {
        sData += `Limpeza `;
      }
      if (cut.data.partNumber) {
        sData += `Part:${cut.data.partNumber} `;
      }
    }
    this.mensagem = `Corte ${cut.number} ${sData} Direção:${cut.direction} Fase:${cut.phase} Role:${cut.role}`;
  }



  corta(estado) {
    let antigaParge = JSON.parse(JSON.stringify(estado.currentPart));
    let cutSize = (estado.cut.direction === "horizontal" ? estado.cut.y1 : estado.cut.x1);
    estado.currentPart.h = (estado.currentPart.h - cutSize) > 0 ? (estado.currentPart.h - cutSize) : 0.1;
    let novaParte = {
      x: estado.currentPart.x,
      y: this.yShaw,
      w: estado.currentPart.w,
      h: cutSize,
      info: ``,
      targetY: 0
    }


    if (estado.cut.data && estado.cut.data.partNumber) {
      novaParte.targetY = this.ready;
      this.ready += (cutSize + 10);
      novaParte.info = `P${estado.cut.data.partNumber} C${estado.cut.number}`;
    }
    else if (estado.cut.data && estado.cut.data.isCleaningCut) {
      novaParte.targetY = this.ready;
      this.ready += 60;
      novaParte.info = `C${estado.cut.number}`;
    }
    else {
      novaParte.targetY = this.space;
      this.space -= (this.space - novaParte.h - 10);
      novaParte.info = `W ${estado.cut.number}`;
    }


    this.parts.push(novaParte);
    estado.nextPart.push(estado.currentPart);
    estado.nextPart.push(novaParte);

    console.log(`CORTOU NOVA ${novaParte.info} CS:${cutSize} npH:${novaParte.h} + ${estado.currentPart.h} = ${antigaParge.h}`);

    estado.cut = null;
  }

  iniciaCorte() {
    //this.solution.plans.forEach(plan => {
    let i = 0;
    let j = 0;

    this.mensagem = `Iniciando layout ${i} ${j}`;

    let plan = this.solution.plans[i];

    let layout = plan.layouts[j];
    let board = layout.board;
    let cuts = layout.cuts;
    console.log(`Cuts ${cuts.length}`);

    let estado = { nextPart: [], cut: null, pausa: 0, iCut: -1, aY: this.acaleracao, currentPart: { x: 0, y: 0 - board.height, w: board.width, h: board.height, info: "Board", targetY: this.yShaw - board.height }, cuts: cuts };
    this.estadoV = estado;
    this.parts.push(estado.currentPart);
    console.log(`Estado NPS:${estado.nextPart.length} iCut:${estado.iCut} aY:${estado.aY} CY:${estado.currentPart.y} ${estado.cut ? JSON.stringify(estado.cut) : ''}`);
    let interval = setInterval(() => {
      this.debug = `Estado NPS:${estado.nextPart.length} iCut:${estado.iCut} aY:${estado.aY} TY:${estado.currentPart.targetY} CY:${estado.currentPart.y} `;
      this.deslocamento = `${Math.round(estado.currentPart.targetY - estado.currentPart.y)}`;
      if (estado.pausa > 0) { // PAUSADO
        estado.pausa--;
      }
      else if (estado.iCut < 0) { //Animação Inicial
        if (Math.abs(estado.currentPart.y - estado.currentPart.targetY) >= Math.abs(2 * estado.aY)) { //Não chegou
          estado.currentPart.y += estado.aY;
        }
        else {  //Chegou
          estado.currentPart.y = estado.currentPart.targetY; //para remover os erros dos passos
          estado.iCut = 0;
          estado.cut = cuts[estado.iCut];
          this.atualizaMensagem(estado.cut);
          estado.currentPart.targetY += (estado.cut.direction === "horizontal" ? estado.cut.y1 : estado.cut.x1);
        }
      }
      else { //Movendo parte
        if (Math.abs(estado.currentPart.y - estado.currentPart.targetY) > Math.abs(2 * estado.aY)) { //não chegou
          estado.currentPart.y += estado.aY;
        }
        else { //Chegou
          estado.pausa = 100;
          estado.currentPart.y = estado.currentPart.targetY; //para remover os erros dos passos
          if (estado.cut) {
            this.corta(estado);
            estado.iCut++;
          }
          else if (estado.nextPart.length > 0) {
            estado.currentPart = estado.nextPart.pop();
            estado.aY = estado.currentPart.y < estado.currentPart.targetY ? this.acaleracao : -this.acaleracao;
          }
          if (estado.iCut < cuts.length) {
            estado.cut = cuts[estado.iCut];
            this.verificaMudancaDeFase(estado);
          }
        }
      }
      if (estado.iCut >= estado.cuts.length) {// acabou
        clearInterval(interval);
        console.log("FIM");
        this.mensagem = "FIM do Layout";
        estado.pausa = 10000;
      }
    }, 20);
  }

  verificaMudancaDeFase(estado) {
    if (estado.cut.phase > estado.cuts[estado.iCut - 1].phase) {//avançou uma fase
      console.log(`avançou uma fase  ENL:${estado.nextPart.length} \n`);
      if (estado.nextPart.length > 0) {
        [estado.currentPart.w, estado.currentPart.h] = [estado.currentPart.h, estado.currentPart.w];
      }
      estado.currentPart.targetY -= (estado.currentPart.h + estado.nextPart.length > 0 ? estado.nextPart[estado.nextPart.length - 1].h : 0);
      estado.aY = estado.currentPart.y < estado.currentPart.targetY ? this.acaleracao : -this.acaleracao;
    }
    else if (estado.cut.phase > estado.cuts[estado.iCut - 1].phase) {//retrocedeu uma fase
      //Volta Giro 
      [estado.currentPart.w, estado.currentPart.h] = [estado.currentPart.h, estado.currentPart.w];
      estado.targetY -= estado.currentPart.h;
      estado.aY = estado.currentPart.y < estado.targetY ? this.acaleracao : -this.acaleracao;
    }
  }

}
