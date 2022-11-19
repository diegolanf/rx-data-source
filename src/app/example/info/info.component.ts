import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { DataSource } from '@app/core/models/data-source.model';
import { PaginationParams, PaginationStrategy } from '@app/core/models/table-config.model';
import { TableDataSource } from '@app/core/models/table-data-source.model';
import { map, Observable } from 'rxjs';

@Component({
  selector: 'app-info',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatDividerModule],
  templateUrl: './info.component.html',
  styleUrls: ['./info.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoComponent<T> implements OnInit {
  @Input() public tableDataSource?: TableDataSource<T>;
  @Input() public dataSource?: DataSource<T>;

  public paginationStrategy$: Observable<string> | undefined;
  public skip$: Observable<number | undefined> | undefined;
  public take$: Observable<number | undefined> | undefined;

  ngOnInit(): void {
    this.paginationStrategy$ = this.tableDataSource?.paginationStrategy$.pipe(
      map((strategy: PaginationStrategy) => strategy.toString())
    );

    this.skip$ = this.tableDataSource?.paginationParams$.pipe(
      map((params: PaginationParams | undefined) => params?.skip)
    );

    this.take$ = this.tableDataSource?.paginationParams$.pipe(
      map((params: PaginationParams | undefined) => params?.take)
    );
  }
}
