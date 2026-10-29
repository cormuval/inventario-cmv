export interface ActionState {
    ok: boolean;
    message: string;
    id?: string;
    advertencia?: string;
}

export const initialActionState: ActionState = {
    ok: false,
    message: ""
};
