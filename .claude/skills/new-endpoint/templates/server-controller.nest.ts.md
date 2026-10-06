# NestJS controller, service and repository template

There are **no ORM imports here**. The controller handles HTTP only and calls the service. There is always a service, even when it only delegates. The service gets the db package's API **injected** through an abstract-class provider; it never imports db functions itself.

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
// server/src/matches/matches.repository.ts
import type { Provider } from '@nestjs/common';
import { getUserById, listUserMatches } from '<db package name>';

// The abstract class is both the interface and the DI token.
export abstract class MatchesRepository {
  abstract getUserById: typeof getUserById;
  abstract listUserMatches: typeof listUserMatches;
}

export const matchesRepositoryProvider: Provider = {
  provide: MatchesRepository,
  useValue: { getUserById, listUserMatches } satisfies MatchesRepository,
};
```

```ts
// server/src/matches/matches.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { ListUserMatchesQuery, ListUserMatchesResponse } from '<utils package name>';
import { MatchesRepository } from './matches.repository';

@Injectable()
export class MatchesService {
  constructor(private readonly matchesRepository: MatchesRepository) {}

  async listForUser(userId: string, query: ListUserMatchesQuery): Promise<ListUserMatchesResponse> {
    const user = await this.matchesRepository.getUserById(userId);
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: `User ${userId} not found` });

    return this.matchesRepository.listUserMatches(userId, query);
  }
}
```

Register the controller, the service and `matchesRepositoryProvider` in the feature module, and import that module in `AppModule` if it's new. If the project's exception filter already maps errors to `{ code, message, details? }`, throw what it expects instead.
