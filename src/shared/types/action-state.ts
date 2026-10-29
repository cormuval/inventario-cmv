export interface ActionState {
    ok: boolean;
    message: string;
    id?: string;
}

export const initialActionState: ActionState = {
    ok: false,
    message: ""
};
