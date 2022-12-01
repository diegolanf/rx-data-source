import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { generateArray } from '@app/shared/utils/generate.utils';
import { delay, map, Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private totalRows = 25;

  public getRows(params: HttpParams): Observable<number[]> {
    const skip = +(params.get('skip') ?? 0);
    const take = +(params.get('take') ?? this.totalRows);
    console.info('Params - Skip:', skip, ', Take:', take);
    return of(generateArray((i: number) => skip + i + 1, take)).pipe(
      delay(2000),
      map((r: number[]) => {
        console.info('API response:', r);
        return r;
      })
    );
  }
}
