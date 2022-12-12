import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { generateArray } from '@app/shared/utils/generate.utils';
import { delay, Observable, of, tap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly totalRows = 25;

  public getRows(params: HttpParams): Observable<number[]> {
    const skip = +(params.get('skip') ?? 0);
    const take = +(params.get('take') ?? this.totalRows);
    return of(generateArray((i: number) => skip + i + 1, take)).pipe(
      delay(1000),
      tap((r: number[]) => {
        console.info('API response:', r);
      })
    );
  }
}
