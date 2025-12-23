import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class AppResolver {
	@Query(() => String)
	public sayHello(): string {
		return 'Welcome to Nestar GraphQL API Server!';
	}
}
