import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataSource } from '@app/core/models/data-source.model';
import { PaginationStrategy, SortDirection } from '@app/core/models/table-config.model';
import { TableDataSource } from '@app/core/models/table-data-source.model';

@Component({
  selector: 'app-actions',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './actions.component.html',
  styleUrls: ['./actions.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionsComponent<T> {
  @Input() public tableDataSource?: TableDataSource<T>;
  @Input() public dataSource?: DataSource<T>;

  public paginationStrategy = PaginationStrategy;

  public setSort(sortColumn: string | null): void {
    if (this.tableDataSource)
      this.tableDataSource.sort = sortColumn
        ? { column: sortColumn, direction: SortDirection.desc }
        : null;
  }

  public toggleLimit(limit: number | boolean): void {
    if (this.tableDataSource) this.tableDataSource.limit = limit;
  }

  public togglePaginationStrategy(strategy: PaginationStrategy): void {
    if (this.tableDataSource) this.tableDataSource.paginationStrategy = strategy;
  }
}
