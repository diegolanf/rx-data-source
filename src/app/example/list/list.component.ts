import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { TableDataSource } from '@app/core/models/table-data-source.model';
import { ForModule } from '@rx-angular/template';

@Component({
  selector: 'app-list',
  standalone: true,
  imports: [CommonModule, ForModule, MatCardModule, MatDividerModule],
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListComponent<T> {
  @Input() public tableDataSource?: TableDataSource<T>;
}
