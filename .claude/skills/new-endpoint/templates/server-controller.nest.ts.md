# NestJS controller and service template

There are **no ORM imports here**. The service calls the db package's API.

```ts
// server/src/matches/matches.controller.ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  listUserMatchesQuerySchema,
  userIdParamsSchema,
  type ListUserMatchesQuery,
  type ListUserMatchesResponse,
  type UserIdParams,
} from '<utils package name>';
import { ZodValidationPipe } from '../common/zod-validation.pipe'; // reuse the existing pipe if present
import { AuthGuard } from '../auth/auth.guard';
import { MatchesService } from './matches.service';

@Controller('users/:id/matches')
@UseGuards(AuthGuard)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  list(
    @Param(new ZodValidationPipe(userIdParamsSchema)) params: UserIdParams,
    @Query(new ZodValidationPipe(listUserMatchesQuerySchema)) query: ListUserMatchesQuery,
  ): Promise<ListUserMatchesResponse> {
    return this.matchesService.listForUser(params.id, query);
  }
}
```

```ts
// server/src/matches/matches.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { getUserById, listUserMatches } from '<db package name>';
import type { ListUserMatchesQuery, ListUserMatchesResponse } from '<utils package name>';

@Injectable()
export class MatchesService {
  async listForUser(userId: string, query: ListUserMatchesQuery): Promise<ListUserMatchesResponse> {
    const user = await getUserById(userId);
    if (!user) throw new NotFoundException('User not found');

    return listUserMatches(userId, query);
  }
}
```

Register the controller and service in the feature module, and import that module in `AppModule` if it's new.
