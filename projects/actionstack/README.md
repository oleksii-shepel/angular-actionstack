ActionStack is a powerful Angular library designed to enhance state management in web applications. It integrates seamlessly with Angular best practices, providing a scalable and maintainable approach to managing application state while handling asynchronous operations effectively.

[redux-docs](https://redux.js.org/)
[observable-docs](https://redux-observable.js.org/)
[saga-docs](https://redux-saga.js.org/)
[actionstack-docs](https://actionstack.vercel.app/documentation/)

  [![build status](https://github.com/actioncrew/actionstack/workflows/build/badge.svg)](https://github.com/actioncrew/actionstack/workflows/build/badge.svg)
  [![npm version](https://img.shields.io/npm/v/@actioncrew%2Factionstack.svg?style=flat-square)](https://www.npmjs.com/package/@actioncrew%2Factionstack)
  [![npm downloads](https://img.shields.io/npm/dm/@actioncrew%2Factionstack.svg?style=flat-square)](https://www.npmjs.com/package/@actioncrew%2Factionstack)
  [![min+zipped](https://img.shields.io/bundlephobia/minzip/%40actioncrew%2Factionstack)](https://img.shields.io/bundlephobia/minzip/%40actioncrew%2Factionstack)
  
## Key Features
- Reactive State Management: Leverages RxJS observables for a reactive approach, keeping your components and views in sync with the latest state changes.
- Immutable State Updates: Ensures predictable and maintainable state transitions by promoting immutability principles.
- Typed State Definitions: Improves developer experience and code clarity with TypeScript support for defining state structures.
- Angular Integration: Seamlessly integrates with Angular concepts like components, directives, and services, providing a familiar development workflow.
- Community-Driven: Backed by an active community and comprehensive documentation, ensuring ongoing support and learning opportunities.

## What Sets ActionStack Apart
ActionStack differentiates itself from other state management solutions with its robust support for asynchronous operations. This includes:

- Asynchronous Actions: Actions can be asynchronous, allowing for operations like API calls to be seamlessly integrated.
- Asynchronous Reducers: Reducers can handle asynchronous processes, ensuring state updates occur smoothly.
- Asynchronous Meta-Reducers: Meta-reducers can also operate asynchronously, providing an additional layer of state management.
- Asynchronous Selectors: Selectors can fetch and transform state data asynchronously, ensuring your views are always up-to-date.

State management in ActionStack is streamlined by defining the initial state within reducers, allowing for automatic state tree construction and a clean, modular architecture.

ActionStack excels in managing state for large-scale applications by offering full featured support for multiple store modules. Modules can dynamically attach and detach their states from the central store, optimizing memory usage and simplifying state management by avoiding unnecessary data retention and facilitating smoother state transitions.

The tracker and execution stack components provide valuable insights into the system's behavior at any given moment. The tracker monitors how state changes propagate from their initial update in reducers through to the selectors, while the execution stack keeps track of the sequence of operations and function calls. Together, they help diagnose issues and understand the flow of execution, enabling more effective debugging and performance analysis.

## Extending the Store with Side Effects
ActionStack enables extending the store to handle side effects, such as epics and sagas, by registering them with specific actions to manage complex asynchronous flows. This approach minimizes the core store's complexity while leveraging middleware concepts to effectively manage side effects and enhance scalability. For convenience, you can use subclasses such as EpicStore or SagaStore defined in each module. They add an extend method to the store, and offer an enhanced version of the store for injection. Just remember to load these modules into the AppModule.

### Epics
Epics, a concept from the Redux ecosystem popular in Angular via NgRx, use RxJS operators to transform actions into other actions, leveraging reactive programming for managing complex asynchronous events and interactions.

### Sagas
Sagas, an alternative to RxJS, manage side effects by executing asynchronous tasks in response to actions. They use generator functions for handling complex workflows, such as concurrent tasks and action coordination.

## Tools
As part of the ActionStack bundle, several tools are provided to enhance development and debugging:

- Logger: Logs state changes and actions to the console for easier debugging.
- Performance Monitor: Monitors the performance of state changes and actions, helping to identify bottlenecks.
- State Freezer: Freezes the state to prevent accidental mutations, ensuring state immutability.

# Conclusion
With ActionStack by your side, state management in your Angular applications becomes a breeze. Its distinctive features make it an invaluable tool for developers seeking control, efficiency, predictability and scalability in their Angular applications. Conquer the wild west of state with confidence and build amazing, performant applications!
