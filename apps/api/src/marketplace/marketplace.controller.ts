import { Controller, Get, Query } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('machines')
  async searchMachines(@Query() query: any) {
    return this.marketplaceService.searchMachines(query);
  }
}
