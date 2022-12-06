import { CommonModule } from '@angular/common';
import { HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DataSource } from '@app/core/models/data-source.model';
import { Interval, INTERVAL_CONFIG } from '@app/core/models/interval.model';
import { TableDataSource } from '@app/core/models/table-data-source.model';
import { ApiService } from '@app/core/services/api.service';
import { ActionsComponent } from '@app/example/actions/actions.component';
import { InfoComponent } from '@app/example/info/info.component';
import { ListComponent } from '@app/example/list/list.component';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-example',
  standalone: true,
  imports: [ActionsComponent, CommonModule, InfoComponent, ListComponent],
  templateUrl: './example.component.html',
  styleUrls: ['./example.component.scss'],
  providers: [
    TableDataSource,
    DataSource,
    Interval,
    {
      provide: INTERVAL_CONFIG,
      useValue: { refreshInterval: 20 },
    },
    RxActionFactory,
    RxState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExampleComponent {
  constructor(
    private readonly apiService: ApiService,
    public dataSource: DataSource<number>,
    public tableDataSource: TableDataSource<number>
  ) {
    this.tableDataSource.source = (params: HttpParams): Observable<number[]> =>
      this.apiService.getRows(params);
  }
}
