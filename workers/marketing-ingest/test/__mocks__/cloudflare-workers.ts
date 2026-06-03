export class WorkerEntrypoint<_Env = unknown, _Props = unknown> {
  protected env!: _Env;
  protected ctx!: { props: _Props };
}
