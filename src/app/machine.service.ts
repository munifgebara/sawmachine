import { Injectable } from '@angular/core';
import { Http, Headers, Response } from '@angular/http';


@Injectable({
  providedIn: 'root'
})
export class MachineService {

  protected baseUrl = 'https://cors-anywhere.herokuapp.com/https://s3.amazonaws.com/ccprod-rails-paperclip/optimizations/solutions/000/377/262/original/solution.txt?1527171360090';
  //protected baseUrl = 'http://munif.com.br/solution.json';
  constructor(protected http: Http) { }

  errorHandler = error => console.error('MachineService error', error);


  getSolution(): Promise<any> {
    return this.http.get(`${this.baseUrl}`)
      .toPromise().then(response => response.json())
      .catch(this.errorHandler);
  }



}
