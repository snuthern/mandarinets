import { Router } from "https://deno.land/x/oak/router.ts";
import { ApplicationContext } from "../../main-core/application-context/mandarineApplicationContext.ts";
import { ControllerComponent } from "../core/internal/components/routing/controllerContext.ts";
import { requestResolver, middlewareResolver } from "../core/internal/components/routing/routingResolver.ts";
import { MandarineLoading } from "../../main-core/mandarineLoading.ts";
import { Log } from "../../logger/log.ts";
import { Request } from "https://deno.land/x/oak/request.ts";
import { SessionMiddleware } from "../core/middlewares/sessionMiddleware.ts";
import { MandarineMvcFrameworkEngineMethods } from "./mandarineMvcFrameworkEngineMethods.ts";
import { MiddlewareComponent } from "../../main-core/components/middleware-component/middlewareComponent.ts";
import { Mandarine } from "../../main-core/Mandarine.ns.ts";
import { Cookies } from "https://deno.land/x/oak/cookies.ts";
export class MandarineMvcFrameworkStarter {

    private router: Router = new Router();

    private logger: Log = Log.getLogger(MandarineMvcFrameworkStarter);

    private essentials: {
        sessionMiddleware: SessionMiddleware
    } = {
        sessionMiddleware: undefined
    }

    constructor() {

        MandarineLoading();

        // ORDER OF THINGS MATTER
        // If the repository proxy is resolved after the dependencies, then the dependencies will have an empty repository
        this.resolveRepositoriesProxy();
        this.resolveComponentsDependencies();

        MandarineMvcFrameworkEngineMethods.initializeEngineMethods();

        this.initializeControllers();
        this.intializeControllersRoutes();
        this.initializeEssentials();
        this.initializeEntityManager();
    }

    private initializeEntityManager() {
        let entityManager = ApplicationContext.getInstance().getEntityManager();
        if(entityManager.getDataSource() != undefined) {
            entityManager.initializeEssentials();
            entityManager.initializeAllEntities();
        }
    }

    private resolveComponentsDependencies(): void {
        ApplicationContext.getInstance().getComponentsRegistry().resolveDependencies();
    }

    private resolveRepositoriesProxy(): void {
        ApplicationContext.getInstance().getComponentsRegistry().connectRepositoriesToProxy();
    }

    private initializeEssentials() {
        this.essentials.sessionMiddleware = new SessionMiddleware();
    }

    private initializeControllers() {
        ApplicationContext.getInstance().getComponentsRegistry().getControllers().forEach((controller) => {
            (<ControllerComponent>controller.componentInstance).initializeControllerFunctionality();
        })
    }

    private intializeControllersRoutes(): void {
        let mvcControllers: Mandarine.MandarineCore.ComponentRegistryContext[] = ApplicationContext.getInstance().getComponentsRegistry().getControllers();

        if(mvcControllers.length == 0) {
            this.logger.warn("No controllers have been found"); 
            return;
        }

        try {

            mvcControllers.forEach((component: Mandarine.MandarineCore.ComponentRegistryContext, index) => {
                let controller: ControllerComponent = <ControllerComponent> component.componentInstance;
                controller.getActions().forEach((value, key) => {
                    this.router = this.addPathToRouter(this.router, value, controller);
                });
            });

            this.logger.info(`A total of ${mvcControllers.length} controllers have been initialized`);
        }catch(error){
            this.logger.error(`Controllers could not be initialized`, error);
        }

    }

    private preRequestInternalMiddlewares(context: any): void {
        this.essentials.sessionMiddleware.createSessionCookie(context);
    }

    private postRequestInternalMiddlewares(context: any): void {
        this.essentials.sessionMiddleware.storeSession(context);
    }

    private async executeUserMiddlewares(preRequestMiddleware: boolean, middlewares: Array<MiddlewareComponent>, context: any, routingAction: Mandarine.MandarineMVC.Routing.RoutingAction): Promise<boolean> {
        for(const middlewareComponent of middlewares) {
            if(middlewareComponent.regexRoute.test(context.request.url.toString())) {
                let middlewareResolved: boolean = await middlewareResolver(preRequestMiddleware, middlewareComponent, routingAction, context);

                if(preRequestMiddleware) {
                    return middlewareResolved;
                } else {
                    return true;
                }
            }
        }
        return true;
    }

    private addPathToRouter(router: Router, routingAction: Mandarine.MandarineMVC.Routing.RoutingAction, controllerComponent: ControllerComponent): Router {
        let route: string = controllerComponent.getActionRoute(routingAction);

        let availableMiddlewares: Array<MiddlewareComponent> = Mandarine.Global.getMiddleware();

        let responseHandler = async (context) => {
            
            MandarineMvcFrameworkEngineMethods.initializeDefaultsForResponse(context);

            this.preRequestInternalMiddlewares(context); // Execute internal middleware like sessions
            let continueRequest: boolean = await this.executeUserMiddlewares(true, availableMiddlewares, context, routingAction); // If the user has any middleware, execute it

            if(continueRequest) {
                context.response.body = await requestResolver(routingAction, context);
                this.executeUserMiddlewares(false, availableMiddlewares, context, routingAction);
                this.postRequestInternalMiddlewares(context);
            }
        };

        switch(routingAction.actionType) {
            case Mandarine.MandarineMVC.HttpMethods.GET:
                return router.get(route, responseHandler);
            case Mandarine.MandarineMVC.HttpMethods.POST:
                return router.post(route, responseHandler);
            case Mandarine.MandarineMVC.HttpMethods.DELETE:
                return router.delete(route, responseHandler);
            case Mandarine.MandarineMVC.HttpMethods.OPTIONS:
                return router.options(route, responseHandler);
            case Mandarine.MandarineMVC.HttpMethods.PUT:
                return router.put(route, responseHandler);
            case Mandarine.MandarineMVC.HttpMethods.PATCH:
                return router.patch(route, responseHandler);
            case Mandarine.MandarineMVC.HttpMethods.HEAD:
                return router.head(route, responseHandler);
        }
    }

    public getRouter(): Router {
        return this.router;
    }
}